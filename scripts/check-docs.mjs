#!/usr/bin/env node
// ドキュメント整理の機械チェック(ドラフト)。判定は OK / NG の二値(警告なし)。
// docs/_docmap.json を契約として、確定的に判定できる範囲だけを検査する:
//   1. 追跡漏れ    … docs/・specs/ 配下の .md が _docmap.json に登録されているか
//   2. サイズ肥大化 … 各ドキュメントの行数が maxLines を超えていないか(1行でも超えたらNG)
//   3. 見出し重複  … 指定ドキュメント間で同じ見出しが複数に実在していないか(allowDuplicateHeadings で除外可)
//   4. リンク切れ  … Markdownの相対リンク(.md)の参照先が存在するか
//   5. SSoT越境    … あるドキュメントの owns トピックが、別ドキュメントの見出しに現れていないか
//                    (参照見出し「対応する〜」「§〜」は自動除外。個別の例外は allowSsotCrossReferences)
// 意味的な整合性・重複・役割適合の判断は Skill doc-consistency-review 側で行う。
//
// GitHub Actions 上では、各NGを ::error アノテーションとして出し、ジョブサマリに一覧表を追記する。

import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const docmapPath = join(repoRoot, 'docs/_docmap.json');
const onGitHubActions = process.env.GITHUB_ACTIONS === 'true';

/** 走査対象。ここ配下の .md をすべて「存在するドキュメント」として集める。 */
const scanTargets = ['CLAUDE.md', 'docs', 'specs'];

/** @type {{kind:string, file:string, message:string}[]} */
const findings = [];
const fail = (kind, file, message) => findings.push({ kind, file, message });

// --- _docmap.json 読み込み ---------------------------------------------------
if (!existsSync(docmapPath)) {
  console.error('docs/_docmap.json が見つかりません。');
  process.exit(1);
}
const docmap = JSON.parse(readFileSync(docmapPath, 'utf8'));
const rules = docmap.rules ?? {};
const trackedPaths = Object.keys(docmap.docs ?? {});

// --- 実在する .md を集める -------------------------------------------------------
/** @returns {string[]} repoRoot からの相対パス(スラッシュ区切り) */
function collectMarkdown(target) {
  const abs = join(repoRoot, target);
  if (!existsSync(abs)) return [];
  const found = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        walk(join(p, name));
      }
      return;
    }
    if (p.endsWith('.md'))
      found.push(relative(repoRoot, p).split('\\').join('/'));
  };
  walk(abs);
  return found;
}

const actualPaths = [...new Set(scanTargets.flatMap(collectMarkdown))].sort();

// --- 1. 追跡漏れ / 参照先なし --------------------------------------------------
for (const p of actualPaths) {
  if (!trackedPaths.includes(p)) {
    fail(
      '追跡漏れ',
      p,
      `${p} が docs/_docmap.json に未登録。役割(purpose / owns / notHere)と maxLines を追記してください。`,
    );
  }
}
for (const p of trackedPaths) {
  if (!existsSync(join(repoRoot, p))) {
    fail(
      '参照先なし',
      p,
      `docs/_docmap.json の "${p}" に対応するファイルがありません。`,
    );
  }
}

// --- 見出し抽出 -------------------------------------------------------------------
const headingLevel = rules.headingLevelForDuplicateCheck ?? 3;
const minHeadingLen = rules.minHeadingLengthForDuplicateCheck ?? 4;

/** 見出しから記号・章番号を落として比較用に正規化する。 */
function normalizeHeading(line) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^§?\s*\d+([.\-][0-9a-z]+)*\.?\s*/i, '')
    .trim();
}

/** @returns {{level:number, raw:string, norm:string, line:number}[]} */
function headingsOf(relPath) {
  const text = readFileSync(join(repoRoot, relPath), 'utf8');
  const out = [];
  text.split('\n').forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (!m) return;
    out.push({
      level: m[1].length,
      raw: m[2].trim(),
      norm: normalizeHeading(line),
      line: i + 1,
    });
  });
  return out;
}

const headingCache = new Map();
for (const p of trackedPaths) {
  if (existsSync(join(repoRoot, p))) headingCache.set(p, headingsOf(p));
}

// --- 2. サイズ肥大化(1行でも超過でNG)--------------------------------------
for (const [p, meta] of Object.entries(docmap.docs)) {
  const abs = join(repoRoot, p);
  if (!existsSync(abs)) continue;
  const lines = readFileSync(abs, 'utf8').split('\n').length;
  const max = meta.maxLines;
  if (typeof max !== 'number') {
    fail('契約不備', p, `${p} に maxLines が設定されていません。`);
    continue;
  }
  if (lines > max) {
    fail(
      '肥大化',
      p,
      `${lines} 行で上限 ${max} 行を超過。役割の違う記述を移す / 陳腐化した節を削る / 版数履歴を圧縮する、で対応。本質的に必要なら docs/_docmap.json の maxLines を理由付きで引き上げる。`,
    );
  }
}

// --- 3. 見出し重複(NG。意図的な重複は allowDuplicateHeadings に追記)--------
const dupScope = rules.duplicateHeadingScope ?? [];
const allowDup = new Set(rules.allowDuplicateHeadings ?? []);
/** norm -> Set<relPath> */
const headingOwners = new Map();
for (const p of dupScope) {
  for (const h of headingCache.get(p) ?? []) {
    if (h.level < headingLevel) continue;
    if (h.norm.length < minHeadingLen) continue;
    if (allowDup.has(h.norm)) continue;
    if (!headingOwners.has(h.norm)) headingOwners.set(h.norm, new Set());
    headingOwners.get(h.norm).add(p);
  }
}
for (const [norm, owners] of headingOwners) {
  if (owners.size > 1) {
    const list = [...owners];
    fail(
      '見出し重複',
      list[0],
      `「${norm}」が ${list.join(' / ')} に存在。同じ内容の実体コピーならSSoT側に集約し他方は要約+リンクへ。意図的な重複なら docs/_docmap.json の allowDuplicateHeadings に "${norm}" を追記。`,
    );
  }
}

// --- 4. リンク切れ(相対 .md リンク)-------------------------------------------
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
for (const p of trackedPaths) {
  const abs = join(repoRoot, p);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, 'utf8');
  for (const m of text.matchAll(linkRe)) {
    const target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const pathPart = target.split('#')[0];
    if (!pathPart || !pathPart.endsWith('.md')) continue;
    const resolved = join(dirname(abs), pathPart);
    if (!existsSync(resolved))
      fail('リンク切れ', p, `${p} → ${target} の参照先が存在しません。`);
  }
}

// --- 5. SSoT越境(owns トピックが他ドキュメントの見出しに出現)----------------
// 「対応する〜」「関連する〜」や §番号を含む見出しは、SSoTを指すための参照見出しなので除外する。
const isCrossReferenceHeading = (raw) =>
  /^(対応する|関連する|参照)/.test(raw) || raw.includes('§');
const allowSsot = new Set(rules.allowSsotCrossReferences ?? []);
for (const [ownerPath, meta] of Object.entries(docmap.docs)) {
  for (const topic of meta.owns ?? []) {
    for (const [otherPath, headings] of headingCache) {
      if (otherPath === ownerPath) continue;
      const hit = headings.find(
        (h) => h.norm.includes(topic) && !isCrossReferenceHeading(h.raw),
      );
      if (!hit) continue;
      if (allowSsot.has(`${otherPath}::${hit.raw}`)) continue;
      fail(
        'SSoT越境',
        otherPath,
        `「${topic}」は ${ownerPath} が所有するトピックですが ${otherPath}:${hit.line} に見出し「${hit.raw}」があります。内容を持つ側を1つにする。参照目的で正当なら docs/_docmap.json の allowSsotCrossReferences に "${otherPath}::${hit.raw}" を追記。`,
      );
    }
  }
}

// --- 出力 -----------------------------------------------------------------------
for (const f of findings) {
  console.log(`  NG [${f.kind}] ${f.message}`);
  if (onGitHubActions) {
    const msg = `[${f.kind}] ${f.message}`.replace(/\n/g, ' ');
    console.log(`::error file=${f.file}::${msg}`);
  }
}

const summary = `docs check: ${findings.length} 件のNG / ${actualPaths.length} ドキュメント`;
console.log(`\n${summary}`);

if (onGitHubActions && process.env.GITHUB_STEP_SUMMARY) {
  const rows = findings.map(
    (f) =>
      `| ${f.kind} | \`${f.file}\` | ${f.message.replace(/\n/g, ' ').replace(/\|/g, '\\|')} |`,
  );
  const table =
    findings.length === 0
      ? `### docs check ✅\n\n${summary}\n`
      : `### docs check ❌\n\n${summary}\n\n| 種類 | ファイル | 内容 |\n|---|---|---|\n${rows.join('\n')}\n`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
}

process.exit(findings.length > 0 ? 1 : 0);

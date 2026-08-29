import type { ManualChunk } from '../manualChunk.js';

/** 見出しを探すのはチャンク本文の先頭付近だけにする(本文中の見出しを拾わないため) */
const headingSearchLineCount = 3;

/** Markdownの見出し行(`#`〜`###`)。設計書§3.4のフォールバック仕様に合わせて3段階まで */
const headingPattern = /^#{1,3}[ \t]+(.+)$/;

/** R2に置く際のフォルダ名。出典表示ではファイル名だけを見せる */
const manualsKeyPrefix = 'manuals/';

/** チャンク本文の先頭付近からMarkdown見出しを取り出す。見つからなければundefined */
function extractHeading(chunkText: string): string | undefined {
  let checkedLineCount = 0;

  for (const line of chunkText.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;

    const heading = headingPattern.exec(trimmedLine)?.[1]?.trim();
    if (heading) {
      return heading;
    }

    checkedLineCount += 1;
    if (checkedLineCount >= headingSearchLineCount) break;
  }

  return undefined;
}

/**
 * 検索でヒットしたチャンクから出典の行を組み立てる(F-02)。
 * 見出しが取れれば「ファイル名 > 見出し」、取れなければファイル名のみ。
 * 出典はLLMに出力させずここで組み立てるため、検索でヒットしたファイル以外は出典に現れない。
 */
export function formatSources(chunks: ManualChunk[]): string[] {
  const sources: string[] = [];

  for (const chunk of chunks) {
    const fileName = chunk.fileName.startsWith(manualsKeyPrefix)
      ? chunk.fileName.slice(manualsKeyPrefix.length)
      : chunk.fileName;
    if (fileName === '') continue;

    const heading = extractHeading(chunk.text);
    const source = heading ? `${fileName} > ${heading}` : fileName;

    // 同じ見出しの別チャンクが複数ヒットしても出典は1行にまとめる
    if (!sources.includes(source)) {
      sources.push(source);
    }
  }

  return sources;
}

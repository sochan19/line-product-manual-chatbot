import { build } from 'esbuild';

const lambdaApps = [
  { name: 'webhook-lambda', entry: 'apps/webhook-lambda/src/handler.ts' },
  { name: 'worker-lambda', entry: 'apps/worker-lambda/src/handler.ts' },
];

for (const app of lambdaApps) {
  await build({
    entryPoints: [app.entry],
    outfile: `apps/${app.name}/dist/index.js`,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: true,
    minify: false,
  });
  console.log(`built ${app.name}`);
}

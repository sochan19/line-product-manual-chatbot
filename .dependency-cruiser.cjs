/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-independent-of-adapters-and-apps',
      comment:
        'domain層(業務ルール)はAWS/LINE/Cloudflareへの依存を持つadapters層・apps層に依存してはいけない(ports-and-adapters境界)',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: { path: '^(packages/adapters|apps)' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^(packages|apps)',
  },
};

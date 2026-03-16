/**
 * esbuild configuration for Fly TTY extension
 *
 * Bundles src/extension.ts into dist/extension.js (CommonJS).
 * The engine package is bundled inline (not external) so the
 * extension is self-contained. Only 'vscode' is externalized.
 */

const esbuild = require('esbuild')
const path = require('path')

const isWatch = process.argv.includes('--watch')

const enginePath = path.resolve(__dirname, '../engine')

const context = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  loader: { '.ts': 'ts' },
  alias: {
    '@fly-tty/engine': path.join(enginePath, 'src/index.ts'),
  },
  minify: false,
  logLevel: 'info',
}

if (isWatch) {
  esbuild.context(context).then(ctx => ctx.watch())
} else {
  esbuild.build(context).catch(() => process.exit(1))
}

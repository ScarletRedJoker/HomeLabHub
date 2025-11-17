import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: [
    // Node.js built-ins
    'node:*',
    // Optional native bindings (don't exist in production)
    'bufferutil',
    'utf-8-validate',
    // Vite and dev-only modules (won't exist in production)
    'vite',
    './vite.dev.js',
    './vite.dev',
    './vite.ts',
    './vite',
  ],
  plugins: [
    {
      name: 'resolve-shared-alias',
      setup(build) {
        // Resolve @shared/* path alias to ./shared/*.ts
        build.onResolve({ filter: /^@shared\// }, (args) => {
          const pathWithoutAlias = args.path.replace('@shared/', 'shared/');
          const resolvedPath = resolve(__dirname, pathWithoutAlias + '.ts');
          return { path: resolvedPath };
        });
      }
    },
    {
      name: 'exclude-vite-config',
      setup(build) {
        build.onResolve({ filter: /vite\.config/ }, () => ({
          path: 'vite.config',
          external: true
        }));
      }
    }
  ],
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`
  }
});

console.log('✓ Server build complete');

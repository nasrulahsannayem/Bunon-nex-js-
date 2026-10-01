import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          return html.replace(/%VITE_(\w+)%/g, (match, key) => {
            return env[`VITE_${key}`] || '';
          });
        }
      }
    ],
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: browserslistToTargets(browserslist('>= 0.1%, Chrome >= 60, Safari >= 11, iOS >= 11, Firefox >= 54, Edge >= 15, Android >= 4.4'))
      }
    },
    build: {
      cssMinify: 'lightningcss',
      rollupOptions: {
        output: {
          // Split the vendor payload so the app shell is not blocked by
          // libraries only a few routes need. Before this, EVERY vendor lib
          // (react-dom, motion, lucide, recharts, axios, zustand) landed in a
          // single 508 kB index chunk that every visitor downloaded.
          //
          // Rules that keep this SAFE:
          //  1. Only node_modules is chunked by this function. App code keeps
          //     Rollup's automatic per-route splitting.
          //  2. react + react-dom + scheduler + react-router stay in ONE chunk.
          //     They share internal state; splitting them causes
          //     "Cannot access X before initialization" white screens.
          //  3. Anything unrecognised returns undefined so Rollup handles it
          //     by default rather than being force-named into a wrong chunk.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            // Normalize to the package name so scoped packages and their
            // internal subpaths all resolve to the same chunk.
            const parts = id.split('node_modules/');
            const tail = parts[parts.length - 1];
            const pkg = tail.startsWith('@')
              ? tail.split('/').slice(0, 2).join('/')
              : tail.split('/')[0];

            // --- core runtime: must never be split apart (rule 2) ---
            if (
              pkg === 'react' ||
              pkg === 'react-dom' ||
              pkg === 'scheduler' ||
              pkg === 'react-router' ||
              pkg === 'react-router-dom' ||
              pkg === '@remix-run'
            ) {
              return 'vendor-react';
            }

            // --- charting: admin Reports/Dashboard only. 377 kB raw / 110 kB
            //     gzip that a normal shopper never needs. ---
            if (pkg === 'recharts' || pkg === 'victory-vendor' || pkg.startsWith('d3-')) {
              return 'vendor-charts';
            }

            // --- animation ---
            if (pkg === 'motion' || pkg === 'framer-motion') {
              return 'vendor-motion';
            }

            // --- icons: imported by 43 files, but the individual icons are
            //     tree-shaken. Separate chunk keeps an icon change from
            //     invalidating the React core cache entry. ---
            if (pkg === 'lucide-react' || pkg === 'react-icons') {
              return 'vendor-icons';
            }

            // --- data / markdown / class utils ---
            if (
              pkg === 'axios' ||
              pkg === 'zustand' ||
              pkg === 'clsx' ||
              pkg === 'tailwind-merge' ||
              pkg === 'react-markdown' ||
              pkg === 'unified' ||
              pkg.startsWith('remark-') ||
              pkg.startsWith('mdast-') ||
              pkg.startsWith('micromark') ||
              pkg.startsWith('hast-')
            ) {
              return 'vendor-utils';
            }

            return undefined; // rule 3
          },
        },
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

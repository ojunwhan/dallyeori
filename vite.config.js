import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** /privacy → privacy.html, /terms → terms.html (정적 호스트는 별도 리라이트 권장) */
function rewriteLegalRequestUrl(req) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  const pathname = raw.split('?')[0] || '';
  if (pathname === '/privacy' || pathname === '/privacy/') {
    req.url = '/privacy.html' + q;
  } else if (pathname === '/terms' || pathname === '/terms/') {
    req.url = '/terms.html' + q;
  }
}

function legalPageAliasPlugin() {
  return {
    name: 'legal-page-alias',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteLegalRequestUrl(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteLegalRequestUrl(req);
        next();
      });
    },
    closeBundle() {
      const dist = path.join(__dirname, 'dist');
      const privacySrc = path.join(dist, 'privacy.html');
      const termsSrc = path.join(dist, 'terms.html');
      const privacyDir = path.join(dist, 'privacy');
      const termsDir = path.join(dist, 'terms');
      if (fs.existsSync(privacySrc)) {
        fs.mkdirSync(privacyDir, { recursive: true });
        fs.copyFileSync(privacySrc, path.join(privacyDir, 'index.html'));
      }
      if (fs.existsSync(termsSrc)) {
        fs.mkdirSync(termsDir, { recursive: true });
        fs.copyFileSync(termsSrc, path.join(termsDir, 'index.html'));
      }
    },
  };
}

export default defineConfig({
  base: '/',
  root: 'src',
  publicDir: '../public',
  envDir: '..',
  plugins: [legalPageAliasPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

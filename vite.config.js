import { defineConfig, loadEnv } from 'vite';
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

/** 로컬에서 VITE_API_BASE_URL 비움 → 브라우저가 동일 출처로 /api, /uploads 요청 → Vite가 백엔드로 넘김 */
function devApiProxy(proxyTarget) {
  return {
    '/api': { target: proxyTarget, changeOrigin: true },
    '/uploads': { target: proxyTarget, changeOrigin: true },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:3100';

  return {
    base: '/',
    root: 'src',
    publicDir: '../public',
    envDir: '..',
    plugins: [legalPageAliasPlugin()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: devApiProxy(proxyTarget),
    },
    preview: {
      port: 4173,
      strictPort: false,
      proxy: devApiProxy(proxyTarget),
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
  };
});

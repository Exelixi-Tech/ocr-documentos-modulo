#!/usr/bin/env node
/**
 * Sirve frontend/dist en :5181 y proxea /api|/files|/docs|/nexus-api a backends.
 * Sustituye `vite preview` en producción: el proxy de preview rompe POST multipart
 * (Apache → 502 Bad Gateway en /api/documents/upload).
 *
 * Uso (PM2): node scripts/serve-prod.js
 * Env: PORT=5181 OCR_API_ORIGIN FORM_API_ORIGIN NEXUS_API_ORIGIN OCR_PROXY_TIMEOUT_MS
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'frontend', 'dist');
const PORT = Number(process.env.PORT || 5181);
const OCR_API = (process.env.OCR_API_ORIGIN || 'http://127.0.0.1:4001').replace(/\/$/, '');
const FORM_API = (process.env.FORM_API_ORIGIN || 'http://127.0.0.1:4002').replace(/\/$/, '');
const NEXUS_API = (process.env.NEXUS_API_ORIGIN || 'http://127.0.0.1:3092').replace(/\/$/, '');
const PROXY_TIMEOUT_MS = Number(process.env.OCR_PROXY_TIMEOUT_MS || 300000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function stripModulePrefix(pathname) {
  if (pathname === '/ocr' || pathname.startsWith('/ocr/')) {
    const rest = pathname.slice(4) || '/';
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

function isProxyPath(pathname) {
  return (
    pathname === '/nexus-api'
    || pathname.startsWith('/nexus-api/')
    || pathname.startsWith('/api/')
    || pathname === '/api'
    || pathname.startsWith('/files/')
    || pathname === '/files'
    || pathname.startsWith('/docs')
    || pathname.endsWith('/docs.json')
  );
}

function resolveUpstream(pathname) {
  if (pathname.startsWith('/api/valrep') || pathname.startsWith('/api/catalogo')) {
    return { base: FORM_API, path: pathname };
  }
  if (pathname === '/nexus-api' || pathname.startsWith('/nexus-api/')) {
    const rest = pathname.slice('/nexus-api'.length) || '/';
    return { base: NEXUS_API, path: rest.startsWith('/') ? rest : `/${rest}` };
  }
  return { base: OCR_API, path: pathname };
}

function proxyRequest(req, res, pathname) {
  const { base, path: upstreamPath } = resolveUpstream(pathname);
  let dest;
  try {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    dest = new URL(`${base}${upstreamPath}${qs}`);
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const headers = { ...req.headers, host: dest.host };
  delete headers['accept-encoding'];

  const proxyReq = http.request(
    dest,
    { method: req.method, headers, timeout: PROXY_TIMEOUT_MS },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Gateway Timeout');
    }
  });

  proxyReq.on('error', (err) => {
    console.error('[serve-prod] proxy error', dest.href, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    }
  });

  req.pipe(proxyReq);
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(root, cleaned);
  if (!abs.startsWith(root)) return null;
  return abs;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let filePath = safeJoin(DIST, pathname === '/' ? '/index.html' : pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end();
        return;
      }
      sendFile(res, filePath);
      return;
    }

    // SPA fallback (rutas sin extensión)
    if (!path.extname(pathname)) {
      const index = path.join(DIST, 'index.html');
      fs.access(index, fs.constants.R_OK, (accessErr) => {
        if (accessErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end();
          return;
        }
        sendFile(res, index);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
}

if (!fs.existsSync(DIST)) {
  console.error(`[serve-prod] falta ${DIST} — ejecuta npm run build en frontend`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const pathnameRaw = rawUrl.split('?')[0] || '/';
  const pathname = stripModulePrefix(pathnameRaw);

  if (isProxyPath(pathname)) {
    proxyRequest(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.requestTimeout = PROXY_TIMEOUT_MS + 30_000;
server.headersTimeout = PROXY_TIMEOUT_MS + 60_000;
server.timeout = 0;

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[serve-prod] :${PORT} dist=${DIST} api=${OCR_API} form=${FORM_API} nexus=${NEXUS_API} timeout=${PROXY_TIMEOUT_MS}ms`,
  );
});

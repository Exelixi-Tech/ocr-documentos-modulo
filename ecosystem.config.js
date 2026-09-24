/**
 * PM2 — Módulo OCR (Producción)
 *
 * Uso:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js
 *   pm2 stop ocr-api ocr-web
 *   pm2 delete ocr-api ocr-web
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'ocr-api',
      cwd: path.join(ROOT, 'server'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4001,
      },
      out_file:   path.join(ROOT, 'logs', 'ocr-api.out.log'),
      error_file: path.join(ROOT, 'logs', 'ocr-api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      // Express-less static + proxy (scripts/serve-prod.js).
      // No usar `vite preview`: su proxy rompe POST multipart → Apache 502 en upload.
      name: 'ocr-web',
      cwd: ROOT,
      script: 'scripts/serve-prod.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5181,
        OCR_API_ORIGIN: 'http://127.0.0.1:4001',
        FORM_API_ORIGIN: 'http://127.0.0.1:4002',
        NEXUS_API_ORIGIN: 'http://127.0.0.1:3092',
        OCR_PROXY_TIMEOUT_MS: '300000',
      },
      out_file:   path.join(ROOT, 'logs', 'ocr-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'ocr-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};

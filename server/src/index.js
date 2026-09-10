/**
 * Exelixi · Modulo OCR
 *
 * Backend Express minimalista, autonomo. Solo expone los endpoints
 * relacionados con la lectura de documentos.
 *
 * Endpoints:
 *   POST /api/documents/upload   (multipart/form-data: file, docType)
 *   GET  /files/:filename         (sirve los uploads procesados)
 *   GET  /api/health              (sanity check)
 */
require('dotenv').config();
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const ocrRoutes    = require('./routes/ocr');
const catalogRoutes = require('./routes/catalog');
const tarjetaRoutes = require('./routes/activacionTarjeta');
const nexusAuth    = require('./middleware/nexusAuth');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 4001;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

app.use(cors({
  origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

const { uploadRoot } = require('./lib/expedienteFs');
const UPLOAD_DIR = uploadRoot();
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/files', express.static(UPLOAD_DIR));

// ── Swagger UI ────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'OCR API · Exelixi',
  customfavIcon: '',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Sistema]
 *     summary: Estado del servicio OCR
 *     responses:
 *       200:
 *         description: Servicio activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:   { type: string, example: ok }
 *                 module:   { type: string, example: ocr }
 *                 provider: { type: string, example: gemini }
 *                 model:    { type: string, example: gemini-2.5-pro }
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    module: 'ocr',
    provider: process.env.OCR_PROVIDER || 'mock',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    nexusAuth: process.env.NEXUS_AUTH_ENABLED === 'true',
  });
});

// Proxy de catálogos Valrep/INMA al backend de Formulario (4002)
// MUST be registered BEFORE the nexusAuth catch-all /api route
const VALREP_URL = (process.env.VALREP_API_URL || 'http://localhost:4002').replace(/\/$/, '');
async function proxyValrep(req, res) {
  try {
    const upstream = await axios({
      method: req.method,
      url: `${VALREP_URL}${req.originalUrl}`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    console.error('[ocr → valrep proxy]', err.message);
    res.status(502).json({ success: false, code: 'VALREP_PROXY_ERROR', message: err.message });
  }
}
app.use('/api/valrep', proxyValrep);
app.use('/api/catalogo', proxyValrep);

// Catálogo Exélixi (product-builder) — sin nexus_token; credenciales server-side
app.use('/api/catalog', catalogRoutes);

// Commit expediente: emision-api en localhost (token de otro submódulo)
const expedienteInternal = require('./routes/expedienteInternal');
app.use('/api/documents/commit-expediente', expedienteInternal);

// Activación tarjeta RCV (farmacia) — validate-card/bill sin nexus_token
app.use('/api/tarjeta', tarjetaRoutes);

// Multi-tenant: todas las rutas /api (excepto /api/health y proxies arriba) requieren nexus_token
app.use('/api', nexusAuth, ocrRoutes);

app.use((err, _req, res, _next) => {
  console.error('[modulo-ocr] error:', err);
  res.status(err.status || 500).json({
    success: false, code: err.code || 'INTERNAL', message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[modulo-ocr] escuchando en http://localhost:${PORT}`);
  console.log(`[modulo-ocr] OCR_PROVIDER=${process.env.OCR_PROVIDER || 'mock'} model=${process.env.GEMINI_MODEL || 'gemini-2.5-pro'}`);
  console.log(`[modulo-ocr] Swagger UI → http://localhost:${PORT}/docs`);
});

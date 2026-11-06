/**
 * Catálogo Exélixi (product-builder) — solo lectura para el front OCR.
 */
const express = require('express');
const axios = require('axios');
const builder = require('../services/productBuilderClient');
const requireConfigPanelToken = require('../middleware/requireConfigPanelToken');

const router = express.Router();

// ── Actores Sis2000 (canales alternos + gestores) vía server-api-sys ──
const ACTORES_CACHE_TTL_MS = 5 * 60 * 1000;
let actoresCache = { at: 0, data: null };

// server-api-sys (nest-api), NO el SysIP de tarjetas. Misma convención que
// activacionTarjeta: módulo y nest-api conviven en el mismo servidor
// (QA: nexusqa…/nest-api-docs público, 127.0.0.1:3002 local).
function nestBaseUrl() {
  return (
    process.env.NEST_API_URL
    || process.env.SYSIP_API_URL
    || 'http://127.0.0.1:3002'
  ).replace(/\/$/, '');
}

function nestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = (process.env.NEST_APIKEY || '').trim();
  if (key) headers.apikey = key;
  return headers;
}

/**
 * @openapi
 * /api/catalog/actores:
 *   get:
 *     tags: [Catálogo]
 *     summary: Canales alternos y gestores activos (Sis2000, vía server-api-sys)
 *     description: Requiere el token del parametrizador (scope config-panel).
 *     responses:
 *       200:
 *         description: "{ canales: [...], gestores: [...] }"
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: El token no es del parametrizador
 */
router.get('/actores', requireConfigPanelToken, async (_req, res) => {
  if (actoresCache.data && Date.now() - actoresCache.at < ACTORES_CACHE_TTL_MS) {
    return res.json({ success: true, data: actoresCache.data, cached: true });
  }
  try {
    const upstream = await axios.get(`${nestBaseUrl()}/api/v1/canal/actores`, {
      headers: nestHeaders(),
      timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 20000,
      validateStatus: () => true,
    });
    const body = upstream.data;
    if (upstream.status >= 400 || !body || body.status !== true || !body.data) {
      // Si el Core falla, servir el último catálogo conocido aunque esté vencido.
      if (actoresCache.data) {
        return res.json({ success: true, data: actoresCache.data, cached: true, stale: true });
      }
      return res.status(502).json({
        success: false,
        message: 'No se pudo obtener el catálogo de canales/gestores del Core.',
      });
    }
    actoresCache = { at: Date.now(), data: body.data };
    return res.json({ success: true, data: body.data });
  } catch (err) {
    console.error('[catalog] actores:', err.message);
    if (actoresCache.data) {
      return res.json({ success: true, data: actoresCache.data, cached: true, stale: true });
    }
    return res.status(502).json({
      success: false,
      message: 'No se pudo obtener el catálogo de canales/gestores del Core.',
    });
  }
});

/**
 * @openapi
 * /api/catalog/products:
 *   get:
 *     tags: [Catálogo]
 *     summary: Lista productos emitibles del product-builder
 *     responses:
 *       200:
 *         description: Productos con planes y coberturas listos
 */
router.get('/products', async (_req, res, next) => {
  try {
    const products = await builder.listEmitibleProducts();
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/catalog/products/{id}:
 *   get:
 *     tags: [Catálogo]
 *     summary: Detalle de un producto emitible
 */
router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await builder.getProduct(req.params.id);
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

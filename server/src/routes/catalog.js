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
  const key = (process.env.NEST_API_KEY || process.env.NEST_APIKEY || '').trim();
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
let actoresInflight = null;

function buildGestorCanalIndex(data) {
  const index = new Map();
  for (const g of Array.isArray(data?.gestores) ? data.gestores : []) {
    const cgestor = String(g?.cgestor ?? '').trim();
    const ccanalalt = Number(g?.ccanalalt);
    if (cgestor && Number.isFinite(ccanalalt) && ccanalalt > 0) index.set(cgestor, ccanalalt);
  }
  return index;
}

async function fetchActores() {
  const upstream = await axios.get(`${nestBaseUrl()}/api/v1/canal/actores`, {
    headers: nestHeaders(),
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 20000,
    validateStatus: () => true,
  });
  const body = upstream.data;
  if (upstream.status >= 400 || !body || body.status !== true || !body.data) {
    throw new Error(`el Core respondió ${upstream.status}`);
  }
  return body.data;
}

/**
 * Catálogo de actores con caché de 5 min. Si el Core falla se sirve el último
 * catálogo conocido aunque esté vencido (`stale`); sin ninguno, lanza.
 * Las peticiones simultáneas con la caché vencida comparten una sola llamada.
 */
async function loadActores() {
  if (actoresCache.data && Date.now() - actoresCache.at < ACTORES_CACHE_TTL_MS) {
    return { data: actoresCache.data, index: actoresCache.index, cached: true };
  }
  if (!actoresInflight) {
    actoresInflight = fetchActores()
      .then((data) => {
        actoresCache = { at: Date.now(), data, index: buildGestorCanalIndex(data) };
        return { data, index: actoresCache.index };
      })
      .catch((err) => {
        console.error('[catalog] actores:', err.message);
        if (actoresCache.data) {
          return { data: actoresCache.data, index: actoresCache.index, cached: true, stale: true };
        }
        throw err;
      })
      .finally(() => { actoresInflight = null; });
  }
  return actoresInflight;
}

router.get('/actores', requireConfigPanelToken, async (_req, res) => {
  try {
    const { data, cached, stale } = await loadActores();
    return res.json({
      success: true,
      data,
      ...(cached ? { cached: true } : {}),
      ...(stale ? { stale: true } : {}),
    });
  } catch {
    return res.status(502).json({
      success: false,
      message: 'No se pudo obtener el catálogo de canales/gestores del Core.',
    });
  }
});

/**
 * @openapi
 * /api/catalog/gestor-canal:
 *   get:
 *     tags: [Catálogo]
 *     summary: Canal alterno de un punto de comercialización (magestor)
 *     description: >
 *       Match exacto del cgestor contra el catálogo cacheado de server-api-sys. Devuelve solo el
 *       código del canal (sin nombres ni cédulas) para que el OCR herede el «OCR opcional» del
 *       canal. `data: null` si el punto no existe, está inactivo o no pertenece a un canal.
 *     parameters:
 *       - in: query
 *         name: cgestor
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ success: true, data: { ccanalalt } | null }"
 *       400:
 *         description: Falta cgestor
 *       502:
 *         description: El catálogo no respondió (el OCR queda obligatorio)
 */
router.get('/gestor-canal', async (req, res) => {
  const cgestor = typeof req.query.cgestor === 'string' ? req.query.cgestor.trim() : '';
  if (!cgestor || cgestor.length > 60) {
    return res.status(400).json({ success: false, message: 'cgestor requerido.' });
  }
  try {
    const { index } = await loadActores();
    const ccanalalt = index?.get(cgestor);
    return res.json({ success: true, data: ccanalalt ? { ccanalalt } : null });
  } catch {
    return res.status(502).json({ success: false, message: 'Catálogo de canales no disponible.' });
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
// Solo pruebas: vaciar la caché entre casos.
module.exports._resetActoresCache = () => { actoresCache = { at: 0, data: null }; actoresInflight = null; };

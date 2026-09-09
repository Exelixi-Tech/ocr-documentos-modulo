/**
 * Proxy de activación de tarjeta RCV (farmacia) hacia La Mundial.
 * El front no llama qaapisys2000 directo.
 *
 *   POST /api/tarjeta/validate-card  { codigoTarjeta }
 *   POST /api/tarjeta/validate-bill  { xcodigo_unico, nfactura }
 */
const express = require('express');
const axios = require('axios');

const router = express.Router();

function cardsBaseUrl() {
  return (
    process.env.LAMUNDIAL_CARDS_URL
    || process.env.LAMUNDIAL_BASE_URL
    || 'https://qaapisys2000.lamundialdeseguros.com'
  ).replace(/\/$/, '');
}

function cardsHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = (
    process.env.LAMUNDIAL_CARDS_APIKEY
    || process.env.LAMUNDIAL_APIKEY
    || process.env.LAMUNDIAL_EMISSION_APIKEY
    || ''
  ).trim();
  if (key) headers.apikey = key;
  return headers;
}

function normalizeCodigo(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').slice(0, 80);
}

function normalizeNfactura(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 16);
}

function lmMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.data?.mensaje === 'string' && data.data.mensaje.trim()) return data.data.mensaje.trim();
  if (typeof data.mensaje === 'string' && data.mensaje.trim()) return data.mensaje.trim();
  return fallback;
}

function isLmSuccess(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.success === false || data.status === false) return false;
  const resultado = data.data?.resultado ?? data.resultado;
  if (resultado != null && Number(resultado) !== 1) return false;
  return data.success === true || data.status === true || Number(resultado) === 1;
}

async function postLm(path, body) {
  const url = `${cardsBaseUrl()}${path}`;
  const upstream = await axios.post(url, body, {
    headers: cardsHeaders(),
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 20000,
    validateStatus: () => true,
  });
  return upstream;
}

router.post('/validate-card', async (req, res) => {
  const codigoTarjeta = normalizeCodigo(req.body?.codigoTarjeta);
  if (!codigoTarjeta) {
    return res.status(400).json({ success: false, message: 'El código de tarjeta es requerido.' });
  }

  try {
    const upstream = await postLm('/api/v1/cards/validate-card', { codigoTarjeta });
    const data = upstream.data && typeof upstream.data === 'object' ? upstream.data : {};
    if (upstream.status >= 400 || !isLmSuccess(data)) {
      return res.status(upstream.status >= 400 ? upstream.status : 422).json({
        success: false,
        message: lmMessage(data, 'Tarjeta no válida para activación.'),
        data: data.data || null,
      });
    }
    return res.status(200).json({
      success: true,
      message: lmMessage(data, 'Tarjeta válida para activación'),
      data: data.data || data,
    });
  } catch (err) {
    console.error('[activacion-tarjeta] validate-card:', err.message);
    return res.status(502).json({
      success: false,
      code: 'TARJETA_LM_NETWORK',
      message: 'No se pudo consultar la tarjeta. Inténtalo de nuevo.',
    });
  }
});

router.post('/validate-bill', async (req, res) => {
  const xcodigo_unico = normalizeCodigo(req.body?.xcodigo_unico);
  const nfactura = normalizeNfactura(req.body?.nfactura);
  if (!xcodigo_unico || !nfactura) {
    return res.status(400).json({
      success: false,
      message: 'Se requieren xcodigo_unico y nfactura.',
    });
  }

  try {
    const upstream = await postLm('/api/v1/cards/validate_bill', { xcodigo_unico, nfactura });
    const data = upstream.data && typeof upstream.data === 'object' ? upstream.data : {};
    if (upstream.status >= 400 || !isLmSuccess(data)) {
      return res.status(upstream.status >= 400 ? upstream.status : 422).json({
        success: false,
        message: lmMessage(data, 'La factura no es válida para esta tarjeta.'),
        data: data.data || null,
      });
    }
    return res.status(200).json({
      success: true,
      message: lmMessage(data, 'Factura validada'),
      data: data.data || data,
    });
  } catch (err) {
    console.error('[activacion-tarjeta] validate-bill:', err.message);
    return res.status(502).json({
      success: false,
      code: 'FACTURA_LM_NETWORK',
      message: 'No se pudo verificar la factura. Inténtalo de nuevo.',
    });
  }
});

module.exports = router;

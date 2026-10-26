/**
 * Proxy de activación de tarjeta RCV (farmacia) hacia La Mundial.
 * El front no llama qaapisys2000 directo.
 *
 *   POST /api/tarjeta/validate-card  { codigoTarjeta }
 *   POST /api/tarjeta/validate-bill  { xcodigo_unico, nfactura }
 *   POST /api/tarjeta/autopago       { token }   → nest-api (venta en caja, enlace ?ap=)
 */
const express = require('express');
const axios = require('axios');
const {
  isTarjetaAlreadyActivated,
  tarjetaYaActivadaMessage,
} = require('../lib/tarjetaEstado');

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

function nestApiBaseUrl() {
  return (
    process.env.NEST_API_URL
    || process.env.SYSIP_API_URL
    || 'http://127.0.0.1:3002'
  ).replace(/\/$/, '');
}

function normalizeCodigo(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').slice(0, 80);
}

function normalizeAutopagoToken(raw) {
  const t = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(t) ? t : '';
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

    const cardPayload = data.data && typeof data.data === 'object' ? data.data : data;
    if (isTarjetaAlreadyActivated(cardPayload, lmMessage(data, ''))) {
      return res.status(422).json({
        success: false,
        code: 'TARJETA_YA_ACTIVADA',
        message: tarjetaYaActivadaMessage(),
        data: cardPayload,
      });
    }

    return res.status(200).json({
      success: true,
      message: lmMessage(data, 'Tarjeta válida para activación'),
      data: cardPayload,
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

/**
 * Autopago retail (Farmatodo): el enlace del correo trae un token en vez de código + factura.
 * nest-api devuelve la compra con la misma forma que validate-card (bfactura=1, plan, canal, cliente).
 */
router.post('/autopago', async (req, res) => {
  const token = normalizeAutopagoToken(req.body?.token);
  if (!token) {
    return res.status(400).json({
      success: false,
      code: 'AUTOPAGO_TOKEN',
      message: 'El enlace de emisión no es válido.',
    });
  }

  try {
    const upstream = await axios.get(
      `${nestApiBaseUrl()}/api/v1/autopago/emisiones/${encodeURIComponent(token)}`,
      {
        timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 20000,
        validateStatus: () => true,
      },
    );
    const data = upstream.data && typeof upstream.data === 'object' ? upstream.data : {};
    if (upstream.status >= 400 || data.success === false) {
      return res.status(upstream.status >= 400 ? upstream.status : 422).json({
        success: false,
        code: data.code || 'AUTOPAGO_NO_VALIDO',
        message: data.message || 'El enlace de emisión no es válido o ya fue utilizado.',
        data: data.data || null,
      });
    }
    const venta = data.data && typeof data.data === 'object' ? data.data : null;
    // Sin datos de la venta (p. ej. NEST_API_URL apunta a otro servidor que responde 200 con HTML)
    // no se puede abrir el flujo: sería una "tarjeta" sin plan ni canal.
    if (!venta || !venta.xcodigo_unico || !venta.autopago) {
      console.error(
        `[activacion-tarjeta] autopago: respuesta sin datos de venta desde ${nestApiBaseUrl()} (HTTP ${upstream.status}, tipo ${typeof upstream.data})`,
      );
      return res.status(502).json({
        success: false,
        code: 'AUTOPAGO_RESPUESTA_INVALIDA',
        message: 'No se pudo leer la compra desde nest-api. Revisa NEST_API_URL de ocr-api.',
      });
    }
    return res.status(200).json({
      success: true,
      message: data.message || 'Compra verificada',
      data: venta,
    });
  } catch (err) {
    console.error('[activacion-tarjeta] autopago:', err.message);
    return res.status(502).json({
      success: false,
      code: 'AUTOPAGO_NETWORK',
      message: 'No se pudo verificar el enlace de emisión. Inténtalo de nuevo.',
    });
  }
});

module.exports = router;

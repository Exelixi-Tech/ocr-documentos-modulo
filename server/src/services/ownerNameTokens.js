'use strict';

/**
 * Nombre/apellido del propietario del carnet de circulación: el OCR a veces mete el
 * serial NIV (ej. "8211MBCA6SD245116") como apellido. Se descarta cualquier token que
 * contenga dígitos o mida >= 10 caracteres alfanuméricos, para que el campo quede
 * vacío y Formulario/Pagos lo pidan en vez de emitir con basura.
 */
function looksLikeSerialToken(token) {
  const t = String(token || '').trim();
  if (!t) return true;
  if (/\d/.test(t)) return true;
  return /^[A-Za-z0-9]{10,}$/.test(t);
}

function stripSerialTokens(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && !looksLikeSerialToken(tok))
    .join(' ');
}

module.exports = { looksLikeSerialToken, stripSerialTokens };

/**
 * Factura de tarjeta: debe traer al menos un ítem de producto La Mundial
 * (ej. "Tarjeta La Mundial De Segur (E)", "POLIZA DE GASTOS FUNERARIOS (E)")
 * y venir de un comercio autorizado (RIF en FACTURA_RIF_PERMITIDOS).
 * Evita activar con cualquier factura (internet, otras aseguradoras, etc.).
 */

const ITEM_LA_MUNDIAL_RE = /(MUNDIAL|P[OÓ]LIZA\s+DE\s+GASTOS\s+FUNERARIOS)/i;

/** Farmatodo y Farmahorro (S.A. Nacional Farmacéutica). */
const DEFAULT_RIF_PERMITIDOS = 'J-000202001,J-000263493';

function normalizeRif(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Lista de RIF permitidos; "*" en el .env desactiva el filtro. */
function rifPermitidos() {
  const raw = String(process.env.FACTURA_RIF_PERMITIDOS ?? DEFAULT_RIF_PERMITIDOS).trim();
  if (raw === '*') return null;
  return raw.split(/[;,\s]+/).map(normalizeRif).filter(Boolean);
}

/**
 * @param {{ itemLaMundial?: unknown, rifComercio?: unknown } | null | undefined} fields
 * @returns {{ ok: boolean, message?: string }}
 */
function validateFacturaItemLaMundial(fields) {
  const item = String(fields?.itemLaMundial ?? '').trim();
  if (!item || !ITEM_LA_MUNDIAL_RE.test(item)) {
    return {
      ok: false,
      message:
        'La factura no incluye un producto de La Mundial de Seguros (tarjeta o póliza). ' +
        'Sube la factura de la farmacia donde compraste la tarjeta.',
    };
  }

  const permitidos = rifPermitidos();
  if (permitidos) {
    const rif = normalizeRif(fields?.rifComercio);
    if (!rif) {
      return {
        ok: false,
        message: 'No se leyó el RIF del comercio en la factura. Sube una foto más nítida.',
      };
    }
    if (!permitidos.includes(rif)) {
      return {
        ok: false,
        message: 'La factura no es de un comercio autorizado para vender la tarjeta La Mundial.',
      };
    }
  }

  return { ok: true };
}

module.exports = { validateFacturaItemLaMundial, ITEM_LA_MUNDIAL_RE, normalizeRif };

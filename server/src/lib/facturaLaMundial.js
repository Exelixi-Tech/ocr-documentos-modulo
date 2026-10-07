/**
 * Factura de tarjeta: debe traer al menos un ítem de producto La Mundial
 * (ej. "Tarjeta La Mundial De Segur (E)", "POLIZA DE GASTOS FUNERARIOS (E)").
 * Evita activar con cualquier factura (internet, servicios, etc.).
 */

const ITEM_LA_MUNDIAL_RE = /(MUNDIAL|P[OÓ]LIZA|SEGUR|FUNERARI)/i;

/**
 * @param {{ itemLaMundial?: unknown } | null | undefined} fields
 * @returns {{ ok: boolean, message?: string }}
 */
function validateFacturaItemLaMundial(fields) {
  const item = String(fields?.itemLaMundial ?? '').trim();
  if (item && ITEM_LA_MUNDIAL_RE.test(item)) return { ok: true };
  return {
    ok: false,
    message:
      'La factura no incluye un producto de La Mundial de Seguros (tarjeta o póliza). ' +
      'Sube la factura de la farmacia donde compraste la tarjeta.',
  };
}

module.exports = { validateFacturaItemLaMundial, ITEM_LA_MUNDIAL_RE };

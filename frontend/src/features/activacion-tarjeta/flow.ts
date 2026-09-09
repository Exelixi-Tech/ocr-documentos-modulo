/**
 * Entrada del flujo RCV por tarjeta de farmacia.
 * No reemplaza el RCV actual: solo si la URL lo pide.
 *
 * Ej.: /ocr/?flujo=tarjeta  ·  /ocr/tarjeta
 */
export function isTarjetaRcvEntry(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flujo = (params.get('flujo') || params.get('entrada') || '').trim().toLowerCase();
    if (flujo === 'tarjeta') return true;
    return /\/tarjeta\/?$/.test(window.location.pathname.replace(/\/+$/, '') || '/');
  } catch {
    return false;
  }
}

/** El código de tarjeta es variado: no se valida formato, solo que no esté vacío. */
export function normalizeCodigoTarjeta(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, '').slice(0, 80);
}

/** Número de factura fiscal (dígitos, conserva ceros a la izquierda). */
export function normalizeNfactura(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 16);
}

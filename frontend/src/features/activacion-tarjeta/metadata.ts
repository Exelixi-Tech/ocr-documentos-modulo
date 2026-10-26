import type { TarjetaActivacion } from './types';

export const TARJETA_METADATA_KEY = 'rcv_tarjeta_metadata_canal';

export function metadataFromTarjetaActivacion(
  tarjeta: TarjetaActivacion,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const raw = tarjeta.raw || {};
  return {
    flujo: 'tarjeta',
    skipPayment: tarjeta.bfactura === 1,
    bfactura: tarjeta.bfactura,
    xcodigo_unico: tarjeta.xcodigoUnico,
    ctarjeta: tarjeta.ctarjeta,
    cplan: tarjeta.cplan,
    cramo: tarjeta.cramo,
    ccanalalt: tarjeta.ccanalalt,
    cproductor: tarjeta.cproductor,
    cproducto: tarjeta.cproducto,
    cmoneda: raw.cmoneda != null ? String(raw.cmoneda) : '$',
    centidad: raw.centidad != null ? String(raw.centidad) : undefined,
    citem: raw.citem != null ? Number(raw.citem) : tarjeta.ccanalalt,
    nombre_producto:
      tarjeta.nombreProducto
      ?? (raw.nombre_producto != null ? String(raw.nombre_producto) : undefined),
    ...(tarjeta.nfactura
      ? { nfactura: String(tarjeta.nfactura).replace(/\D/g, '').slice(0, 16) }
      : {}),
    // Autopago retail: Emisión quema el enlace en nest-api (no cards/activate) y la factura ya está validada.
    ...(tarjeta.autopago
      ? {
          autopago: true,
          autopago_token: tarjeta.autopago.token,
          autopago_cliente: tarjeta.autopago.cliente,
          ...(tarjeta.nfactura ? { nfactura: tarjeta.nfactura } : {}),
        }
      : {}),
    ...extras,
  };
}

export function persistTarjetaMetadataCanal(meta: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(TARJETA_METADATA_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function readTarjetaMetadataCanal(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(TARJETA_METADATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Tarjeta pagada en caja (Farmatodo, bfactura=1): el flujo no pasa por el paso de Pago. */
export function tarjetaYaPagada(metadataCanal?: Record<string, unknown> | null): boolean {
  if (!metadataCanal) return false;
  if (String(metadataCanal.flujo ?? '').trim().toLowerCase() !== 'tarjeta') return false;
  const v = (x: unknown) => x === true || x === 1 || x === '1' || x === 'true';
  return v(metadataCanal.skipPayment) || v(metadataCanal.bfactura);
}

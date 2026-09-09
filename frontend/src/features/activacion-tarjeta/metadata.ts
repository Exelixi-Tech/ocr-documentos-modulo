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
    centidad: raw.centidad != null ? String(raw.centidad) : undefined,
    citem: raw.citem != null ? Number(raw.citem) : tarjeta.ccanalalt,
    nombre_producto:
      tarjeta.nombreProducto
      ?? (raw.nombre_producto != null ? String(raw.nombre_producto) : undefined),
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

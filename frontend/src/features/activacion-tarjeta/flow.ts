/**
 * Entrada del flujo RCV por tarjeta de farmacia.
 * No reemplaza el RCV actual: solo si la URL lo pide.
 *
 * Ej.: /ocr/?flujo=tarjeta  ·  /ocr/tarjeta  ·  /ocr/tarjeta?ap=<token> (autopago retail)
 */
export function isTarjetaRcvEntry(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flujo = (params.get('flujo') || params.get('entrada') || '').trim().toLowerCase();
    if (flujo === 'tarjeta') return true;
    if (readAutopagoToken()) return true;
    return /\/tarjeta\/?$/.test(window.location.pathname.replace(/\/+$/, '') || '/');
  } catch {
    return false;
  }
}

/** Header para ocr-api: flujo farmacia sin nexus_token (paridad catálogo Exélixi). */
export const TARJETA_FLOW_HEADER = 'X-Rcv-Tarjeta-Flow';

export function shouldUseTarjetaPublicApi(): boolean {
  if (isTarjetaRcvEntry()) return true;
  try {
    return sessionStorage.getItem('rcv_tarjeta_public_flow') === '1';
  } catch {
    return false;
  }
}

export type TipoPlacaRcv = 'nacional' | 'extranjera' | 'binacional';

/** Flujo tarjeta: solo RCV nacional (sin extranjera ni binacional). */
export function resolveTipoPlacaForTarjetaFlow(
  detected: TipoPlacaRcv | undefined | null,
): TipoPlacaRcv {
  if (shouldUseTarjetaPublicApi()) return 'nacional';
  return detected ?? 'nacional';
}

export function markTarjetaPublicSession(): void {
  try {
    sessionStorage.setItem('rcv_tarjeta_public_flow', '1');
  } catch {
    /* ignore */
  }
}

/** Ramos de RCV automóvil (18 RCV, 28 RCV binacional). */
const RCV_RAMOS = new Set(['18', '28']);

/** tipo_formulario del lote (mismos valores que ventacards de SysIP, más los de personas). */
const TIPO_RCV = /^(rcv|auto|automovil|automobile)/;
const TIPO_PERSONAS = /^(persona|person|viajero|travel|funerari|vida|salud|ap\b|ap-|accidente)/;
/** Productos que el flujo de tarjeta aún no emite (no son RCV ni personas). */
const TIPO_NO_SOPORTADO = /^(hogar|condomin|patrimon|bien|incendio|casco|empresa|pyme)/;

/**
 * Producto del flujo según la tarjeta validada.
 * 1) tipo_formulario del lote: RCV, personas (flujo `funerario`) o no soportado (null).
 * 2) Sin tipo reconocido: RCV si el plan es de vehículo (FARMPA/FARMMO…), el ramo es de
 *    RCV o la tarjeta no trae ramo; si no, personas (Vida, AP, Funerario, Viajero…).
 */
export function resolveTarjetaProductId(
  tarjeta: { cramo?: string | null; raw?: Record<string, unknown> | null },
  vehicleKind: string | null,
): 'rcv' | 'funerario' | null {
  const tipo = String(tarjeta.raw?.tipo_formulario ?? '').trim().toLowerCase();
  if (tipo) {
    if (TIPO_RCV.test(tipo)) return 'rcv';
    if (TIPO_PERSONAS.test(tipo)) return 'funerario';
    if (TIPO_NO_SOPORTADO.test(tipo)) return null;
  }
  const cramo = String(tarjeta.cramo ?? '').trim();
  if (vehicleKind || !cramo || RCV_RAMOS.has(cramo)) return 'rcv';
  return 'funerario';
}

const AUTOPAGO_TOKEN_RE = /^[A-Za-z0-9_-]{16,80}$/;

export function normalizeAutopagoToken(raw: unknown): string {
  const t = String(raw ?? '').trim();
  return AUTOPAGO_TOKEN_RE.test(t) ? t : '';
}

/** Token del enlace de autopago retail (`?ap=`): la venta en caja ya pagada. */
export function readAutopagoToken(): string {
  try {
    return normalizeAutopagoToken(new URLSearchParams(window.location.search).get('ap'));
  } catch {
    return '';
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

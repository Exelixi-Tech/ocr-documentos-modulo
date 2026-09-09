/** Respuesta de activación de tarjeta (farmacia → RCV). */
export interface TarjetaActivacion {
  codigoIngresado: string;
  xcodigoUnico: string;
  ctarjeta: number | null;
  bfactura: 0 | 1;
  cplan: string | null;
  cramo: string | null;
  ccanalalt: number | null;
  cproductor: number | null;
  cproducto: string | null;
  nombreProducto: string | null;
  nfactura: string | null;
  raw: Record<string, unknown>;
}

export interface ValidateCardResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ValidateBillResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

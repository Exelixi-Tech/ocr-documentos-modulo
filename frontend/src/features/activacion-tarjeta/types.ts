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
  /** Autopago retail: la "tarjeta" es el enlace de una venta en caja (pago ya aplicado). */
  autopago?: TarjetaAutopago | null;
}

export interface TarjetaAutopagoCliente {
  tipo_persona: string | null;
  cci_rif: string | null;
  xcliente: string | null;
  xcorreo: string | null;
  xtelefono: string | null;
}

export interface TarjetaAutopago {
  token: string;
  ncorrelativo: number;
  total: number;
  fventa: string | null;
  expiresAt: string | null;
  cliente: TarjetaAutopagoCliente;
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

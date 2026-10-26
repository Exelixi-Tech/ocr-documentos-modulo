import axios, { AxiosError } from 'axios';
import { moduleApiBase } from '../../lib/app-base';
import { attachNexusTokenAxios } from '../../lib/nexus-token-client';
import { normalizeAutopagoToken, normalizeCodigoTarjeta, normalizeNfactura } from './flow';
import { assertTarjetaDisponible, TARJETA_YA_ACTIVADA_CODE } from './tarjeta-estado';
import type {
  TarjetaActivacion,
  TarjetaAutopago,
  ValidateBillResponse,
  ValidateCardResponse,
} from './types';

const api = axios.create({ baseURL: moduleApiBase() });
attachNexusTokenAxios(api, 'nexus_access_token_ocr');

function asFlag(v: unknown): 0 | 1 {
  if (v === true || v === 1 || v === '1') return 1;
  return 0;
}

function mapTarjeta(codigoIngresado: string, data: Record<string, unknown>): TarjetaActivacion {
  const xcodigo = String(data.xcodigo_unico || data.xcodigoUnico || codigoIngresado).trim();
  return {
    codigoIngresado,
    xcodigoUnico: xcodigo,
    ctarjeta: data.ctarjeta != null ? Number(data.ctarjeta) : null,
    bfactura: asFlag(data.bfactura),
    cplan: data.cplan != null ? String(data.cplan) : null,
    cramo: data.cramo != null ? String(data.cramo) : null,
    ccanalalt: data.ccanalalt != null ? Number(data.ccanalalt) : null,
    cproductor: data.cproductor != null ? Number(data.cproductor) : null,
    cproducto: data.cproducto != null ? String(data.cproducto) : null,
    nombreProducto: data.nombre_producto != null ? String(data.nombre_producto) : null,
    nfactura: null,
    raw: data,
  };
}

function apiError(err: unknown, fallback: string): Error {
  const ax = err as AxiosError<{ message?: string; code?: string }>;
  const msg = ax.response?.data?.message || ax.message || fallback;
  const e = new Error(msg);
  e.name = ax.response?.data?.code || 'TARJETA_ERROR';
  return e;
}

export async function validateCard(codigoTarjeta: string): Promise<TarjetaActivacion> {
  const codigo = normalizeCodigoTarjeta(codigoTarjeta);
  if (!codigo) throw new Error('Ingresa el código de tarjeta.');

  try {
    const { data } = await api.post<ValidateCardResponse>('/tarjeta/validate-card', {
      codigoTarjeta: codigo,
    });
    const payload = (data?.data && typeof data.data === 'object') ? data.data : {};
    const resultado = Number(payload.resultado ?? (data.success ? 1 : 0));
    if (!data?.success || resultado !== 1) {
      const fail = new Error(
        data?.message || String(payload.mensaje || 'Tarjeta no válida para activación.'),
      );
      if ((data as { code?: string })?.code === TARJETA_YA_ACTIVADA_CODE) {
        fail.name = TARJETA_YA_ACTIVADA_CODE;
      }
      throw fail;
    }
    assertTarjetaDisponible(payload, data?.message);
    return mapTarjeta(codigo, payload);
  } catch (err) {
    if (err instanceof Error && err.name !== 'AxiosError') throw err;
    throw apiError(err, 'No se pudo validar la tarjeta.');
  }
}

function mapAutopago(token: string, raw: unknown): TarjetaAutopago {
  const ap = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cli = ap.cliente && typeof ap.cliente === 'object' ? (ap.cliente as Record<string, unknown>) : {};
  const str = (v: unknown) => (v == null || v === '' ? null : String(v));
  return {
    token,
    ncorrelativo: Number(ap.ncorrelativo) || 1,
    total: Number(ap.total) || 1,
    fventa: str(ap.fventa),
    expiresAt: str(ap.expires_at),
    cliente: {
      tipo_persona: str(cli.tipo_persona),
      cci_rif: str(cli.cci_rif),
      xcliente: str(cli.xcliente),
      xcorreo: str(cli.xcorreo),
      xtelefono: str(cli.xtelefono),
    },
  };
}

/**
 * Autopago retail: el enlace `?ap=<token>` reemplaza el código de tarjeta + factura.
 * ocr-api resuelve el token en nest-api y devuelve la compra como una tarjeta con factura (bfactura=1).
 */
export async function validateAutopago(tokenRaw: string): Promise<TarjetaActivacion> {
  const token = normalizeAutopagoToken(tokenRaw);
  if (!token) throw new Error('El enlace de emisión no es válido.');

  try {
    const { data } = await api.post<ValidateCardResponse>('/tarjeta/autopago', { token });
    const payload = (data?.data && typeof data.data === 'object') ? data.data : {};
    if (!data?.success) {
      const fail = new Error(data?.message || 'El enlace de emisión no es válido.');
      fail.name = (data as { code?: string })?.code || 'AUTOPAGO_ERROR';
      throw fail;
    }
    const tarjeta = mapTarjeta(token, payload);
    return {
      ...tarjeta,
      bfactura: 1,
      nfactura: payload.nfactura != null ? normalizeNfactura(payload.nfactura) || null : null,
      autopago: mapAutopago(token, payload.autopago),
    };
  } catch (err) {
    if (err instanceof Error && err.name !== 'AxiosError') throw err;
    throw apiError(err, 'No se pudo verificar el enlace de emisión.');
  }
}

export async function validateBill(xcodigoUnico: string, nfacturaRaw: string): Promise<ValidateBillResponse> {
  const xcodigo_unico = String(xcodigoUnico || '').trim();
  const nfactura = normalizeNfactura(nfacturaRaw);
  if (!xcodigo_unico || !nfactura) {
    throw new Error('Falta el código único o el número de factura.');
  }

  try {
    const { data } = await api.post<ValidateBillResponse>('/tarjeta/validate-bill', {
      xcodigo_unico,
      nfactura,
    });
    if (!data?.success) {
      throw new Error(data?.message || 'La factura no es válida para esta tarjeta.');
    }
    return data;
  } catch (err) {
    if (err instanceof Error && err.name !== 'AxiosError') throw err;
    throw apiError(err, 'No se pudo verificar la factura.');
  }
}

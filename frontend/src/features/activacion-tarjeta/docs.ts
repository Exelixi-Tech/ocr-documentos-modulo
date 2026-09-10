import type { DocType } from '../../types';
import type { TarjetaActivacion } from './types';

/**
 * Si la tarjeta pide factura (bfactura=1), el slot OCR de factura es obligatorio
 * y va aparte de cédula / licencia / certificado.
 */
export function appendFacturaIfNeeded(
  requiredDocs: DocType[],
  optionalDocs: DocType[],
  tarjeta: TarjetaActivacion | null | undefined,
): { requiredDocs: DocType[]; optionalDocs: DocType[] } {
  if (!tarjeta || tarjeta.bfactura !== 1) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }
  const required: DocType[] = requiredDocs.includes('factura')
    ? [...requiredDocs]
    : [...requiredDocs, 'factura'];
  return {
    requiredDocs: required,
    optionalDocs: optionalDocs.filter((d) => d !== 'factura'),
  };
}

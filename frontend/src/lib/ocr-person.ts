import type { OcrResult } from '../types';
import { inferTipoDocFromRaw, normalizeIdentificacionDigits } from './identificacion';

function toIsoFechaNac(raw?: string | null): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function extractPersonFromOcr(ocr?: OcrResult | null): {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc: string;
  licencia?: string;
  fechaNac?: string;
} | null {
  if (!ocr) return null;

  const rawId = ocr.identificacion || ocr.rif;
  const identificacion = normalizeIdentificacionDigits(rawId);
  const tipoDoc =
    ocr.tipoDoc
    ?? inferTipoDocFromRaw(rawId)
    ?? 'V';

  const isPJ = ['J', 'G', 'C'].includes(tipoDoc.toUpperCase());
  const nombre = ocr.nombre || (isPJ ? (ocr.razonSocial ?? '') : '');
  const apellido = isPJ ? '' : (ocr.apellido ?? '');

  if (!identificacion && !nombre && !apellido) return null;

  return {
    nombre,
    apellido,
    identificacion,
    tipoDoc,
    licencia: ocr.numeroLicencia,
    fechaNac: toIsoFechaNac(ocr.fechaNacimiento),
  };
}

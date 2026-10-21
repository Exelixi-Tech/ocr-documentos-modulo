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

  const identificacion = normalizeIdentificacionDigits(ocr.identificacion);
  const nombre = ocr.nombre ?? '';
  const apellido = ocr.apellido ?? '';

  if (!identificacion && !nombre && !apellido) return null;

  const tipoDoc =
    ocr.tipoDoc
    ?? inferTipoDocFromRaw(ocr.identificacion)
    ?? 'V';

  return {
    nombre,
    apellido,
    identificacion,
    tipoDoc,
    licencia: ocr.numeroLicencia,
    fechaNac: toIsoFechaNac(ocr.fechaNacimiento),
  };
}

import { getProductId } from './product';
import { readStoredBuilderProduct } from './builder-catalog';

/**
 * Productos donde el slot de cédula acepta también RIF de empresa (persona jurídica).
 * Hoy solo patrimoniales. RCV y funerario siguen con cédula + RIF opcional aparte.
 * Ampliable sin código con VITE_OCR_RIF_EN_CEDULA_PRODUCTOS (ids separados por coma).
 */
const EXTRA_PRODUCTOS = new Set(
  String(import.meta.env.VITE_OCR_RIF_EN_CEDULA_PRODUCTOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export function aceptaRifEnCedula(): boolean {
  const id = getProductId();
  if (id === 'patrimoniales' || EXTRA_PRODUCTOS.has(id)) return true;
  return readStoredBuilderProduct()?.branch === 'PATRIMONIAL';
}

/** "Cédula del tomador" → "Cédula o RIF del tomador". */
export function labelConRif(label: string): string {
  return label.replace(/^Cédula/, 'Cédula o RIF');
}

import { getProductId } from './product';
import { readStoredBuilderProduct } from './builder-catalog';

/**
 * Productos donde el slot de cédula acepta también RIF de empresa (persona jurídica).
 * Patrimoniales y RCV (persona jurídica toma el RIF en el slot de cédula).
 * Funerario y personas siguen solo con cédula.
 * Ampliable sin código con VITE_OCR_RIF_EN_CEDULA_PRODUCTOS (ids separados por coma).
 */
const EXTRA_PRODUCTOS = new Set(
  String(import.meta.env.VITE_OCR_RIF_EN_CEDULA_PRODUCTOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const PATRIMONIAL_KEY = 'exelixi_rif_en_cedula';

/** Nexus manda `?product=patrimoniales`; getProductId() solo conoce rcv/funerario. */
function isPatrimonialSession(): boolean {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('product');
    if (fromUrl === 'patrimoniales') {
      sessionStorage.setItem(PATRIMONIAL_KEY, '1');
      return true;
    }
    if (fromUrl) sessionStorage.removeItem(PATRIMONIAL_KEY);
    return sessionStorage.getItem(PATRIMONIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function aceptaRifEnCedula(): boolean {
  const id = String(getProductId());
  if (id === 'patrimoniales' || EXTRA_PRODUCTOS.has(id)) return true;
  if (isPatrimonialSession()) return true;
  const builder = readStoredBuilderProduct();
  if (builder?.branch === 'PATRIMONIAL') return true;
  // RCV: solo el flujo RCV (sin producto del builder o con ramo de vehículo); nunca personas/funerario.
  if (id === 'rcv') return !builder || builder.branch === 'RCV_OBLIGATORIO';
  return false;
}

/** "Cédula del tomador" → "Cédula o RIF del tomador". */
export function labelConRif(label: string): string {
  return label.replace(/^Cédula/, 'Cédula o RIF');
}

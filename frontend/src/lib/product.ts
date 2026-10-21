/**
 * Producto activo del flujo de suscripción.
 *
 * El flujo modular (OCR → Formulario → Plan → Pago → Emisión) se reusa para
 * varios productos. El producto se determina por el parámetro `?product=` de la
 * URL (configurado por el admin de Nexus en la URL de cada submódulo) y se
 * conserva en sessionStorage para sobrevivir a la navegación entre módulos.
 *
 * Si no se especifica, el producto por defecto es `rcv` (comportamiento previo).
 */
import type { DocType, ProductId } from '../types';

export interface ProductDocsConfig {
  required: DocType[];
  optional: DocType[];
}

export interface ProductConfig {
  id: ProductId;
  /** Etiqueta corta para badges/títulos (ej. "RCV"). */
  label: string;
  /** Nombre completo del producto (ej. "Seguro Funerario"). */
  fullLabel: string;
  /** Ramo La Mundial asociado (RCV=18, Funerario=9). */
  cramo: number;
  /** Documentos que pide el OCR para este producto. */
  docs: ProductDocsConfig;
  /** True si el flujo incluye datos de vehículo (RCV). */
  hasVehicle: boolean;
}

export const PRODUCTS: Record<ProductId, ProductConfig> = {
  rcv: {
    id: 'rcv',
    label: 'RCV',
    fullLabel: 'Suscripción RCV',
    cramo: 18,
    docs: { required: ['cedula', 'licencia', 'certificado'], optional: ['rif'] },
    hasVehicle: true,
  },
  funerario: {
    id: 'funerario',
    label: 'Funerario',
    fullLabel: 'Seguro Funerario',
    cramo: 9,
    docs: { required: ['cedula', 'cedula_titular'], optional: ['cedula_beneficiario'] },
    hasVehicle: false,
  },
};

const VALID_PRODUCTS: ProductId[] = ['rcv', 'funerario'];
const STORAGE_KEY = 'exelixi_product';

export interface ProductDetectHints {
  url?: string | null;
  nombre?: string | null;
  moduloNombre?: string | null;
  product?: string | null;
}

/**
 * Detecta rcv|funerario y lo persiste en sessionStorage (Nexus verify / bridge).
 * @param {ProductDetectHints} [hints]
 * @returns {ProductId | null}
 */
export function persistProductFromHints(hints?: ProductDetectHints): ProductId | null {
  if (hints?.product === 'funerario') {
    try { sessionStorage.setItem(STORAGE_KEY, 'funerario'); } catch { /* ignore */ }
    return 'funerario';
  }
  if (hints?.product === 'rcv') {
    try { sessionStorage.setItem(STORAGE_KEY, 'rcv'); } catch { /* ignore */ }
    return 'rcv';
  }
  if (hints?.url) {
    try {
      const fromUrl = new URL(hints.url, window.location.origin).searchParams.get('product');
      if (fromUrl === 'funerario' || fromUrl === 'rcv') {
        sessionStorage.setItem(STORAGE_KEY, fromUrl);
        return fromUrl as ProductId;
      }
    } catch { /* ignore */ }
  }
  const label = `${hints?.nombre ?? ''} ${hints?.moduloNombre ?? ''}`.toLowerCase();
  if (label.includes('funerar')) {
    try { sessionStorage.setItem(STORAGE_KEY, 'funerario'); } catch { /* ignore */ }
    return 'funerario';
  }
  return null;
}

/** Lee el producto activo: URL `?product=` → sessionStorage → 'rcv'. */
export function getProductId(): ProductId {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('product');
    if (fromUrl && VALID_PRODUCTS.includes(fromUrl as ProductId)) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl as ProductId;
    }
  } catch { /* ignore */ }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && VALID_PRODUCTS.includes(stored as ProductId)) {
      return stored as ProductId;
    }
  } catch { /* ignore */ }

  return 'rcv';
}

export function getProductConfig(): ProductConfig {
  return PRODUCTS[getProductId()];
}

import axios from 'axios';
import type {
  BuilderCatalogProduct,
  BuilderDocSlot,
  BuilderOcrDocType,
  BuilderProductBranch,
} from '../types/builder-catalog';
import { moduleApiBase } from './app-base';

const api = axios.create({ baseURL: moduleApiBase() });

const KEY_TO_OCR: Record<string, BuilderOcrDocType | null> = {
  CEDULA: 'cedula',
  LICENCIA_CONDUCIR: 'licencia',
  CARNET_CIRCULACION: 'certificado',
  CERTIFICADO_ORIGEN: 'certificado',
  RIF: 'rif',
};

const DEFAULT_DOCS_BY_BRANCH: Record<BuilderProductBranch, Record<string, boolean>> = {
  AUTOMOVIL: { CEDULA: true, LICENCIA_CONDUCIR: true, CARNET_CIRCULACION: true, RIF: false },
  RCV_OBLIGATORIO: { CEDULA: true, LICENCIA_CONDUCIR: true, CARNET_CIRCULACION: true, RIF: false },
  SALUD: { CEDULA: true, RIF: false },
  VIDA: { CEDULA: true, RIF: false },
  PATRIMONIAL: { CEDULA: true, RIF: true },
  INCLUSIVO: { CEDULA: true, RIF: false },
};

const DOC_LABELS: Record<string, string> = {
  CEDULA: 'Cédula de identidad',
  LICENCIA_CONDUCIR: 'Licencia de conducir',
  CARNET_CIRCULACION: 'Carnet de circulación',
  CERTIFICADO_ORIGEN: 'Certificado de origen',
  RIF: 'RIF',
};

export const BUILDER_PRODUCT_STORAGE_KEY = 'exelixi_builder_product';

export function hasNexusAccessToken(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nexus_token')) return true;
    return Boolean(sessionStorage.getItem('nexus_access_token_ocr'));
  } catch {
    return false;
  }
}

/** Ruta pública dedicada: /ocr/exelixi/ (distinta de /ocr/?product=rcv La Mundial). */
export function isExelixiCatalogEntryPath(pathname?: string): boolean {
  const path = (pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return path.endsWith('/exelixi') || path.includes('/ocr/exelixi');
}

export function isExelixiCatalogFlowHint(hints?: {
  url?: string | null;
  nombre?: string | null;
  moduloNombre?: string | null;
}): boolean {
  if (hints?.url) {
    try {
      const parsed = new URL(hints.url, window.location.origin);
      const flow = parsed.searchParams.get('flow');
      if (flow === 'exelixi-catalog' || flow === 'exelixi') return true;
      if (isExelixiCatalogEntryPath(parsed.pathname)) return true;
    } catch {
      /* ignore */
    }
  }
  const label = `${hints?.nombre ?? ''} ${hints?.moduloNombre ?? ''}`.toLowerCase();
  return (
    label.includes('exelixi')
    && (
      label.includes('catalogo')
      || label.includes('catálogo')
      || label.includes('generica')
      || label.includes('genérica')
    )
  );
}

/** Flujo genérico Exélixi: catálogo product-builder (distinto de RCV La Mundial). */
export function useBuilderCatalog(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get('flow');
    if (flow === 'exelixi-catalog' || flow === 'exelixi') return true;
    if (params.get('product') === 'rcv' || params.get('product') === 'funerario') {
      return false;
    }
    if (isExelixiCatalogEntryPath()) return true;
  } catch {
    /* ignore */
  }

  const standaloneEnv =
    import.meta.env.VITE_USE_BUILDER_CATALOG === '1'
    || import.meta.env.VITE_USE_BUILDER_CATALOG === 'true';

  if (standaloneEnv && !hasNexusAccessToken()) return true;

  return false;
}

/**
 * Filtro opcional vía VITE_CATALOG_PRODUCT_NAMES (nombres separados por coma).
 * Sin la variable se muestran TODOS los productos emitibles que devuelva el
 * backend — los productos nuevos del builder aparecen sin tocar código.
 */
function catalogAllowlist(): string[] | null {
  const fromEnv = import.meta.env.VITE_CATALOG_PRODUCT_NAMES?.split(',').map((s: string) => s.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : null;
}

/** Aplica allowlist opcional y deduplica por nombre comercial. */
export function filterCatalogProducts(products: BuilderCatalogProduct[]): BuilderCatalogProduct[] {
  const allow = catalogAllowlist();
  const seen = new Set<string>();
  const out: BuilderCatalogProduct[] = [];
  for (const p of products) {
    if (allow && !allow.includes(p.commercialName)) continue;
    if (seen.has(p.commercialName)) continue;
    seen.add(p.commercialName);
    out.push(p);
  }
  if (allow) {
    out.sort((a, b) => allow.indexOf(a.commercialName) - allow.indexOf(b.commercialName));
  }
  return out;
}

export async function fetchEmitibleProducts(): Promise<BuilderCatalogProduct[]> {
  const { data } = await api.get<{ success: boolean; products: BuilderCatalogProduct[] }>(
    '/catalog/products',
  );
  return filterCatalogProducts(data.products ?? []);
}

export async function fetchBuilderProduct(id: string): Promise<BuilderCatalogProduct> {
  const { data } = await api.get<{ success: boolean; product: BuilderCatalogProduct }>(
    `/catalog/products/${encodeURIComponent(id)}`,
  );
  return data.product;
}

export function branchHasVehicle(branch: BuilderProductBranch): boolean {
  return branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO';
}

export function resolveBuilderDocuments(product: BuilderCatalogProduct): BuilderDocSlot[] {
  let source: { documentKey: string; label: string; required: boolean }[];

  if (product.requiredDocuments?.length) {
    source = product.requiredDocuments.map((d) => ({
      documentKey: d.documentKey,
      label: d.label,
      required: d.required !== false,
    }));
  } else {
    const defaults = DEFAULT_DOCS_BY_BRANCH[product.branch] ?? { CEDULA: true };
    source = Object.entries(defaults).map(([documentKey, required]) => ({
      documentKey,
      label: DOC_LABELS[documentKey] ?? documentKey,
      required,
    }));
  }

  const seen = new Set<BuilderOcrDocType>();
  const slots: BuilderDocSlot[] = [];

  for (const doc of source) {
    const ocrType = KEY_TO_OCR[doc.documentKey];
    if (!ocrType || seen.has(ocrType)) continue;
    seen.add(ocrType);
    slots.push({
      key: doc.documentKey,
      label: doc.label,
      ocrType,
      required: doc.required !== false,
    });
  }

  if (!slots.length) {
    return [{ key: 'CEDULA', label: 'Cédula de identidad', ocrType: 'cedula', required: true }];
  }
  return slots;
}

export function persistBuilderProduct(product: BuilderCatalogProduct | null): void {
  try {
    if (!product) {
      sessionStorage.removeItem(BUILDER_PRODUCT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(BUILDER_PRODUCT_STORAGE_KEY, JSON.stringify(product));
  } catch {
    /* ignore */
  }
}

export function readStoredBuilderProduct(): BuilderCatalogProduct | null {
  try {
    const raw = sessionStorage.getItem(BUILDER_PRODUCT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BuilderCatalogProduct;
  } catch {
    return null;
  }
}

export function activePlanCount(product: BuilderCatalogProduct): number {
  return (product.productPlans ?? []).filter((p) => p.isActive !== false).length;
}

/**
 * Modo «marca neutra» (flujo de prueba del MarketPlace Exélixi).
 *
 * Contrato común (portal + módulos, mismo origen):
 *   ?marca=neutra → sessionStorage['exelixi_marca'] = 'neutra'
 *   ?marca=lm     → se borra la clave
 *   sin parámetro → lo guardado
 *
 * Con el modo activo no se muestra nada de La Mundial (logos, nombre, eslogan,
 * favicon, título). Sin el modo, todo queda igual que antes.
 */

const STORAGE_KEY = 'exelixi_marca';
const PARAM = 'marca';
const NEUTRA = 'neutra';

export const MARCA_NEUTRA_WORDMARK = 'Exélixi';
const TITULO_NEUTRO = 'Exélixi · Captura de documentos';

/** Favicon neutro: círculo simple, sin marca. */
const FAVICON_NEUTRO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#334155"/></svg>',
  );

let cache: boolean | null = null;

function resolver(): boolean {
  try {
    const valor = (new URLSearchParams(window.location.search).get(PARAM) || '').trim().toLowerCase();
    if (valor === NEUTRA) sessionStorage.setItem(STORAGE_KEY, NEUTRA);
    else if (valor === 'lm') sessionStorage.removeItem(STORAGE_KEY);
    return sessionStorage.getItem(STORAGE_KEY) === NEUTRA;
  } catch {
    return false;
  }
}

export function esMarcaNeutra(): boolean {
  if (cache === null) cache = resolver();
  return cache;
}

/** Agrega `marca=neutra` a una URL de continuación si el modo está activo (no toca los demás parámetros). */
export function conMarcaNeutra(url: string): string {
  if (!url || !esMarcaNeutra()) return url;
  try {
    const u = new URL(url, window.location.href);
    u.searchParams.set(PARAM, NEUTRA);
    const absoluta = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
    return absoluta ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

function aplicarDocumentoNeutro(): void {
  const root = document.documentElement;
  root.dataset.marca = NEUTRA;
  document.title = TITULO_NEUTRO;

  const setMeta = (name: string, content: string) => {
    const el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (el) el.content = content;
  };
  setMeta('description', 'Captura de datos de documentos vía OCR.');
  setMeta('apple-mobile-web-app-title', MARCA_NEUTRA_WORDMARK);
  setMeta('application-name', MARCA_NEUTRA_WORDMARK);

  // Favicons, apple-touch-icon y manifest llevan el isotipo / nombre de La Mundial.
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    )
    .forEach((link) => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = FAVICON_NEUTRO;
  document.head.appendChild(icon);
}

/** Se ejecuta al importar el módulo (antes del primer render en main.tsx). */
if (typeof window !== 'undefined' && esMarcaNeutra()) {
  try {
    aplicarDocumentoNeutro();
  } catch {
    /* ignore */
  }
}

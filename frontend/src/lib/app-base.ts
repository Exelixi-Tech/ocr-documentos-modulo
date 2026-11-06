/** Base normalizada del módulo (Vite `base`). Ej. `/` o `/ocr/`. */
function normalizedBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

/** Base URL del módulo (Vite `base`). Ej. `/ocr/` → API en `/ocr/api`. */
export function moduleApiBase(): string {
  const base = normalizedBase();
  if (base === './' && typeof window !== 'undefined') {
    let path = window.location.pathname;
    if (path.endsWith('/index.html')) path = path.slice(0, -'/index.html'.length);
    // /ocr/config es una ruta de la SPA: bajo ella Apache responde index.html con 200.
    path = path.replace(/\/config\/?$/, '/');
    if (!path.endsWith('/')) path += '/';
    return `${path}api`;
  }
  return `${base}api`;
}

/**
 * URL pública de un upload OCR (`/files/empresa/archivo`).
 * En cierrelmds/nexusqa la app vive bajo `/ocr/`; sin prefijo Apache responde 404 en `/files/...`.
 * Idempotente: no duplica `/ocr/` si ya viene prefijada (api + modal).
 */
export function resolveUploadFileUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const base = normalizedBase();
  const baseRoot = base === './' ? '' : base.replace(/\/$/, '');
  let path = url.startsWith('/') ? url : `/${url}`;

  if (baseRoot) {
    const segment = baseRoot.replace(/^\//, '');
    const dupPrefix = `${baseRoot}/${segment}/`;
    if (path.startsWith(dupPrefix)) {
      path = `${baseRoot}/${path.slice(dupPrefix.length)}`;
    }
  }

  if (baseRoot && (path === baseRoot || path.startsWith(`${baseRoot}/`))) {
    return path;
  }

  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${clean}`;
}

/**
 * Ruta de un archivo en `public/` respetando el prefijo de despliegue.
 * Ej. publicAsset('logo.png') → `/ocr/logo.png` cuando base es `/ocr/`.
 */
export function publicAsset(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${normalizedBase()}${clean}`;
}

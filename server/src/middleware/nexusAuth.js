/**
 * Middleware de autenticación multi-tenant via Nexus token.
 *
 * Valida que cada request lleve un `nexus_token` válido firmado por
 * `nexus-api`. Extrae `empresaId` y `submoduloId` del payload y los
 * inyecta en `req.empresa` y `req.submoduloId` para uso aguas abajo.
 *
 * Además valida que el `submoduloId` del token corresponda al submódulo
 * que está corriendo (config NEXUS_EXPECTED_SUBMODULO_ID). Esto evita
 * que un token emitido para el OCR sea usado para llamar al backend
 * del módulo de Pagos, por ejemplo.
 *
 * Permite obtener el token desde:
 *   - Header `Authorization: Bearer <token>`  (preferido)
 *   - Header `x-nexus-token: <token>`
 *   - Query  `?nexus_token=<token>`           (fallback)
 *
 * Configuración (.env):
 *   NEXUS_AUTH_ENABLED=true               # activar/desactivar la validación
 *   TENANT_TOKEN_SECRET=...               # mismo secret que nexus-api
 *   NEXUS_EXPECTED_SUBMODULO_ID=17        # id del submódulo en BD de nexus
 *
 * Si NEXUS_AUTH_ENABLED !== 'true', se omite la validación pero igual
 * se intenta extraer el empresaId para fines de logging/aislamiento.
 */
const jwt = require('jsonwebtoken');
const { restoreMarketplaceActor } = require('../lib/marketplace-actor-cache');

function done(req, _res, next) {
  try { restoreMarketplaceActor(req); } catch { /* ignore */ }
  return next();
}

const ENABLED         = process.env.NEXUS_AUTH_ENABLED === 'true';
const SECRET          = process.env.TENANT_TOKEN_SECRET || '';

// Un mismo backend puede atender varios submódulos (p.ej. el mismo OCR para
// el flujo RCV y el flujo Funerario). Se aceptan varios ids vía
// NEXUS_EXPECTED_SUBMODULO_IDS=17,21 (lista) o el legacy NEXUS_EXPECTED_SUBMODULO_ID.
const EXPECTED_SUBMODS = (
  process.env.NEXUS_EXPECTED_SUBMODULO_IDS ||
  process.env.NEXUS_EXPECTED_SUBMODULO_ID ||
  ''
)
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n) && n > 0);

function extractToken(req) {
  const auth = req.headers.authorization || req.headers['x-nexus-token'];
  if (auth && typeof auth === 'string') {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  if (req.query && req.query.nexus_token) {
    return String(req.query.nexus_token);
  }
  return null;
}

async function nexusAuth(req, res, next) {
  const token = extractToken(req);
  const remoteAddr = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? '';

  // --- BYPASS PARA LA MUNDIAL Y QA ---
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const whitelistedOrigins = (process.env.WHITELISTED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let isBypass = false;
  for (const w of whitelistedOrigins) {
    if (origin.includes(w) || referer.includes(w) || remoteAddr.includes(w)) {
      isBypass = true;
      break;
    }
  }

  if (isBypass) {
    req.empresa = {
      id: 1,
      nombre: process.env.EXPEDIENTE_EMPRESA_FALLBACK || 'La Mundial de Seguros',
    };
    req.submoduloId = EXPECTED_SUBMODS.length > 0 ? EXPECTED_SUBMODS[0] : 17;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          req.nexusMetadata = decoded.metadata || {};
        }
      } catch { /* ignore */ }
    }
    return done(req, res, next);
  }

  // Flujo genérico Exélixi (catálogo product-builder) — acceso directo sin nexus_token
  if (process.env.BUILDER_CATALOG_MODE === 'true' && !token) {
    req.empresa = { id: 0 };
    req.submoduloId = null;
    req.builderCatalogFlow = true;
    return done(req, res, next);
  }
  // -----------------------------------

  if (!ENABLED) {
    // Modo permissive: intenta decodificar sin verificar para tracking
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          req.empresa = {
            id: decoded.empresaId,
            nombre: typeof decoded.empresaNombre === 'string' ? decoded.empresaNombre : undefined,
          };
          req.submoduloId = decoded.submoduloId;
        }
      } catch { /* ignore */ }
    }
    return done(req, res, next);
  }

  if (!SECRET) {
    return res.status(500).json({
      success: false,
      code: 'NEXUS_AUTH_MISCONFIGURED',
      message: 'TENANT_TOKEN_SECRET no está configurado en el backend.',
    });
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_MISSING',
      message: 'Token de acceso requerido (Authorization: Bearer <token>).',
    });
  }

  try {
    const payload = jwt.verify(token, SECRET, { ignoreExpiration: true });
    if (payload.type !== 'tenant_access') {
      return res.status(401).json({
        success: false,
        code: 'NEXUS_TOKEN_INVALID_TYPE',
        message: 'Tipo de token inválido.',
      });
    }
    if (!payload.empresaId || !payload.submoduloId) {
      return res.status(401).json({
        success: false,
        code: 'NEXUS_TOKEN_INCOMPLETE',
        message: 'El token no contiene empresaId/submoduloId.',
      });
    }
    if (EXPECTED_SUBMODS.length > 0 && !EXPECTED_SUBMODS.includes(payload.submoduloId)) {
      return res.status(403).json({
        success: false,
        code: 'NEXUS_TOKEN_WRONG_SUBMODULE',
        message: `Token emitido para submódulo ${payload.submoduloId}, este backend espera ${EXPECTED_SUBMODS.join(', ')}.`,
      });
    }
    req.empresa = {
      id: payload.empresaId,
      nombre: typeof payload.empresaNombre === 'string' ? payload.empresaNombre : undefined,
    };
    req.submoduloId = payload.submoduloId;
    req.nexusToken = token;

    // ── Heartbeat: renueva el token en BD y verifica empresa activa ──────────
    // Se llama al nexus-api en cada petición para deslizar la ventana tokenExpiresAt.
    // Si empresa.activo = false → 403 inmediato.
    // Si nexus-api no responde (timeout/red interna) → fail-open (no cortamos flujos).
    const NEXUS_API = (process.env.NEXUS_API_URL || 'http://192.168.8.120:3092').replace(/\/$/, '');
    try {
      const hbRes = await fetch(`${NEXUS_API}/api/access/heartbeat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (hbRes.ok) {
        const hb = await hbRes.json();
        if (hb.active === false) {
          return res.status(403).json({
            success: false,
            code:    'ACCESS_SUSPENDED',
            message: hb.reason || 'Acceso suspendido. Contacte a su administrador.',
          });
        }
        // Token renovado: actualizar en req para que rutas aguas abajo lo lean
        if (typeof hb.empresaNombre === 'string' && hb.empresaNombre.trim()) {
          req.empresa = { ...(req.empresa || {}), id: req.empresa?.id, nombre: hb.empresaNombre.trim() };
        }
        if (hb.access_token) {
          req.nexusToken = hb.access_token;
          res.setHeader('X-Nexus-Token-Refreshed', hb.access_token);
          res.setHeader('Access-Control-Expose-Headers', 'X-Nexus-Token-Refreshed');
        }
      }
    } catch { /* fail-open: no cortar flujos por fallo temporal de nexus-api */
    }
    // ────────────────────────────────────────────────────────────────────────

    return done(req, res, next);
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_INVALID',
      message: 'Token inválido o expirado.',
    });
  }
}

module.exports = nexusAuth;

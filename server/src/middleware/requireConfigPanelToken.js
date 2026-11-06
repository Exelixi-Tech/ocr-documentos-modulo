/**
 * Exige un JWT de parametrizador (`scope: 'config-panel'`) firmado por Nexus.
 *
 * No se usa nexusAuth porque ese middleware deja pasar peticiones sin token
 * cuando BUILDER_CATALOG_MODE=true, y esta ruta devuelve datos personales.
 * Nexus firma estos tokens con JWT_SECRET, que puede diferir de
 * TENANT_TOKEN_SECRET: hay que probar ambos.
 */
const jwt = require('jsonwebtoken');

function verifySecrets() {
  return [
    ...new Set(
      [process.env.TENANT_TOKEN_SECRET, process.env.NEXUS_JWT_SECRET, process.env.JWT_SECRET]
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean),
    ),
  ];
}

function verifyToken(token, secrets) {
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, { ignoreExpiration: true });
    } catch {
      /* probar el siguiente secreto */
    }
  }
  return null;
}

function requireConfigPanelToken(req, res, next) {
  const secrets = verifySecrets();
  if (secrets.length === 0) {
    return res.status(500).json({
      success: false,
      code: 'NEXUS_AUTH_MISCONFIGURED',
      message: 'Falta JWT_SECRET o TENANT_TOKEN_SECRET en el backend del módulo OCR.',
    });
  }

  const header = req.headers.authorization;
  const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_MISSING',
      message: 'Abre el parametrizador desde el sistema para consultar canales y gestores.',
    });
  }

  const payload = verifyToken(token, secrets);
  if (!payload) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_INVALID',
      message: 'El token del parametrizador no es válido para el módulo OCR.',
    });
  }
  if (payload.scope !== 'config-panel') {
    return res.status(403).json({
      success: false,
      code: 'NEXUS_CONFIG_PANEL_REQUIRED',
      message: 'Este catálogo solo está disponible desde el parametrizador.',
    });
  }
  return next();
}

module.exports = requireConfigPanelToken;

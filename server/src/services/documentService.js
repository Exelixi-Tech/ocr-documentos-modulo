/**
 * Document service: validacion + dispatcher de OCR.
 *
 * El proveedor de OCR se elige por la variable de entorno OCR_PROVIDER:
 *   - "mock"   -> datos simulados (default, util para tests sin red).
 *   - "gemini" -> Google Gemini 2.5 Flash-Lite via @google/genai.
 *
 * Si el proveedor real falla, se hace fallback transparente al mock para
 * no romper el flujo del usuario, pero el error queda registrado.
 */

const VALID_DOC_TYPES = ['cedula', 'licencia', 'certificado', 'rif', 'pasaporte', 'factura'];

const DOC_TYPE_LABELS = {
  cedula: 'Cedula de Identidad',
  licencia: 'Licencia de Conducir',
  certificado: 'Certificado de Circulacion',
  rif: 'Registro Unico de Informacion Fiscal (RIF)',
  pasaporte: 'Pasaporte',
  factura: 'Factura fiscal',
  desconocido: 'documento no reconocido',
};

/**
 * Acepta documentos colombianos en slots cedula/licencia (RCV extranjero)
 * cuando Gemini devuelve desconocido pero extrajo campos utiles.
 */
function docTypeMatchesSlot(expected, detected, fields) {
  if (!detected || detected === expected) return true;
  if (detected !== 'desconocido') return false;
  if (!fields || typeof fields !== 'object') return false;

  if (expected === 'cedula') {
    const digits = String(fields.identificacion ?? '').replace(/\D/g, '');
    const hasName = Boolean(fields.nombre || fields.apellido);
    return digits.length >= 6 && hasName;
  }

  if (expected === 'licencia') {
    const num = String(fields.numeroLicencia ?? '').trim();
    return num.length >= 5;
  }

  return false;
}

/**
 * Validacion basica del archivo (tamano y mime).
 */
function validateDocument(file, _docType) {
  const minSizeBytes = 2048;

  if (file.size < minSizeBytes) {
    return {
      valid: false,
      message: 'El archivo parece estar vacio o corrupto. Sube un documento valido.',
    };
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      message: 'Formato de archivo no soportado. Solo JPG, PNG, WebP, SVG o PDF.',
    };
  }

  return { valid: true };
}

/**
 * Datos simulados consistentes para el modo mock o como fallback.
 */
function simulateOcr(docType) {
  const mock = {
    cedula: {
      nombre: 'Maria',
      apellido: 'Fernandez',
      identificacion: '18456329',
      tipoDoc: 'V',
      fechaNacimiento: '1990-04-15',
      sexo: 'Femenino',
      estadoCivil: 'Soltero(a)',
    },
    licencia: {
      numeroLicencia: 'LIC-0234567',
      categoria: '5ta',
      vencimiento: '2027-06-30',
    },
    certificado: {
      placa: 'AE123KT',
      marca: 'Toyota',
      modelo: 'Corolla',
      anio: '2020',
      serial: 'VIN20TOYCO2020001',
      color: 'Plateado',
      tipoCarnet: 'nacional',
      tipoPlaca: 'nacional',
    },
    rif: {
      rif: 'J-40123456-7',
      razonSocial: null,
    },
  };
  return mock[docType] || {};
}

/**
 * Dispatcher principal de OCR.
 *
 * @param {object} file       Objeto file de multer (con path, mimetype, size).
 * @param {string} docType    cedula | licencia | certificado | rif.
 * @returns {Promise<{provider:string, fields:object, meta?:object, error?:string}>}
 */
function readTarjetaPlanFromRequest(tarjetaHints) {
  if (!tarjetaHints || typeof tarjetaHints !== 'object') return null;
  const { resolveTarjetaPlanVehicleKind } = require('../lib/tarjetaPlanVehicle');
  return resolveTarjetaPlanVehicleKind({
    cplan: tarjetaHints.cplan,
    cproducto: tarjetaHints.cproducto,
    nombreProducto: tarjetaHints.nombreProducto,
  });
}

async function runOcr(file, docType, tarjetaHints) {
  if (!VALID_DOC_TYPES.includes(docType)) {
    throw new Error(`Tipo de documento invalido: ${docType}`);
  }

  const provider = (process.env.OCR_PROVIDER || 'mock').toLowerCase();

  if (provider === 'gemini') {
    try {
      const gemini = require('./geminiProvider');
      const result = await gemini.extract(file.path, file.mimetype, docType);

      const chainSummary = (result.meta.chainAttempts || [])
        .map(a => `${a.model}(${a.criticalOk ? 'ok' : a.error ? 'err' : 'partial'})`)
        .join(' -> ');
      console.log(
        `[OCR] gemini OK (${result.meta.elapsedMs} ms) docType=${docType} ` +
        `model=${result.meta.model}${chainSummary ? ` chain=[${chainSummary}]` : ''}`
      );

      // Validacion: el header del documento debe coincidir con el slot solicitado.
      const detected = result.fields && result.fields.documentoTipo;
      if (detected && !docTypeMatchesSlot(docType, detected, result.fields)) {
        const expectedLabel = DOC_TYPE_LABELS[docType] || docType;
        const detectedLabel = DOC_TYPE_LABELS[detected] || detected;
        console.warn(
          `[OCR] mismatch docType: expected=${docType} detected=${detected} model=${result.meta.model}`
        );
        return {
          provider: 'gemini',
          fields: null,
          meta: result.meta,
          mismatch: {
            expected: docType,
            detected,
            expectedLabel,
            detectedLabel,
            message:
              `El documento subido parece ser un(a) "${detectedLabel}", ` +
              `pero el sistema esperaba un(a) "${expectedLabel}". ` +
              'Por favor sube el archivo correcto en este espacio.',
          },
        };
      }

      const planKind = docType === 'certificado' ? readTarjetaPlanFromRequest(tarjetaHints) : null;
      if (planKind && result.fields) {
        const { validateCertificadoForTarjetaPlan } = require('../lib/tarjetaPlanVehicle');
        const planCheck = validateCertificadoForTarjetaPlan(planKind, result.fields);
        if (!planCheck.ok) {
          console.warn(
            `[OCR] plan vehicle mismatch: plan=${planKind} docType=${docType} ` +
            `cplan=${tarjetaHints?.cplan || ''}`,
          );
          return {
            provider: 'gemini',
            fields: null,
            meta: result.meta,
            planMismatch: {
              message: planCheck.message,
              planKind,
            },
          };
        }
      }

      // Limpiamos el campo interno de validacion antes de devolver al frontend.
      if (result.fields && 'documentoTipo' in result.fields) {
        delete result.fields.documentoTipo;
      }

      return {
        provider: 'gemini',
        fields: result.fields,
        meta: result.meta,
      };
    } catch (err) {
      // Gemini falló (red, cuota, cadena agotada): no devolver mock.
      // La ruta responde 503 y el front deja el slot en error (rojo).
      console.error(`[OCR] gemini fallo. docType=${docType} error=${err.message}`);
      return {
        provider: 'gemini',
        fields: {},
        ocrFailed: true,
        error: err.message,
      };
    }
  }

  // Default: mock con un pequeno delay para simular procesamiento.
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 700));
  return {
    provider: 'mock',
    fields: simulateOcr(docType),
  };
}

module.exports = {
  validateDocument,
  simulateOcr,
  runOcr,
  VALID_DOC_TYPES,
  DOC_TYPE_LABELS,
};


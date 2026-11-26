/**
 * Recorte y enderezado de la copia que se envía a leer. Un modelo ubica el documento
 * pedido dentro de la foto; con eso se recorta sobre la imagen recibida (antes de reducirla),
 * para que el texto llegue con más píxeles. El archivo del expediente NO se toca.
 *
 * Cualquier fallo devuelve null y la lectura sigue con la foto completa.
 *
 * .env: OCR_RECORTE=on lo activa · GEMINI_MODEL_RECORTE · OCR_RECORTE_TIMEOUT_MS
 */
const sharp = require('sharp');
const { GoogleGenAI, Type } = require('@google/genai');

const MODELO_DEFECTO = 'gemini-4-argon';
const TIPOS_IMAGEN = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MARGEN = 0.04;
/** Menos que esto es una detección dudosa; más que lo otro no aporta nada recortar. */
const AREA_MINIMA = 0.05;
const AREA_SIN_RECORTE = 0.85;

const NOMBRE_DOCUMENTO = {
  cedula: 'cédula de identidad, pasaporte o RIF',
  licencia: 'licencia para conducir',
  certificado: 'documento del vehículo (certificado de circulación, título de propiedad o certificado de origen)',
  rif: 'comprobante de RIF',
};

/**
 * Giro horario que endereza el documento. Se pregunta la dirección y no los grados porque el
 * modelo confunde el sentido del giro.
 */
const GIRO_POR_PARTE_SUPERIOR = { arriba: 0, derecha: 270, abajo: 180, izquierda: 90 };

const ESQUEMA = {
  type: Type.OBJECT,
  properties: {
    encontrado: { type: Type.BOOLEAN },
    caja: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description: '[ymin, xmin, ymax, xmax] del documento completo, de 0 a 1000',
    },
    parteSuperior: {
      type: Type.STRING,
      enum: Object.keys(GIRO_POR_PARTE_SUPERIOR),
      description: 'Borde de la FOTO hacia el que apunta la parte de arriba de las letras del documento',
    },
  },
  required: ['encontrado'],
};

function activo() {
  return String(process.env.OCR_RECORTE || '').trim().toLowerCase() === 'on';
}

/** Convierte la caja 0-1000 en píxeles con margen; null si no es utilizable. */
function regionDeRecorte(caja, ancho, alto) {
  if (!Array.isArray(caja) || caja.length !== 4 || !caja.every((n) => Number.isFinite(n))) return null;
  const [y0, x0, y1, x1] = caja.map((n) => Math.min(1000, Math.max(0, n)) / 1000);
  if (x1 <= x0 || y1 <= y0) return null;
  if ((x1 - x0) * (y1 - y0) < AREA_MINIMA) return null;
  const left = Math.round(Math.max(0, x0 - MARGEN) * ancho);
  const top = Math.round(Math.max(0, y0 - MARGEN) * alto);
  const right = Math.round(Math.min(1, x1 + MARGEN) * ancho);
  const bottom = Math.round(Math.min(1, y1 + MARGEN) * alto);
  return { left, top, width: Math.min(ancho, right) - left, height: Math.min(alto, bottom) - top };
}

async function ubicarDocumento(jpeg, docType) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const respuesta = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL_RECORTE || MODELO_DEFECTO,
    contents: [{
      role: 'user',
      parts: [
        { text: `Ubica en la foto este documento: ${NOMBRE_DOCUMENTO[docType]}. ` +
          'Si hay varios documentos, solo ese. Incluye todos sus bordes. ' +
          'Indica parteSuperior: en un texto derecho es "arriba"; si para leerlo habría que ' +
          'inclinar la cabeza, es "derecha" o "izquierda". Si no está, encontrado=false.' },
        { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA,
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'LOW' },
    },
  });
  return JSON.parse(respuesta.text);
}

function conLimite(promesa, ms) {
  let reloj;
  const limite = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`sin respuesta en ${ms} ms`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}

/**
 * @returns {Promise<string|null>} ruta de la copia recortada/enderezada, o null.
 */
async function recortarDocumento(rutaOriginal, mimetype, docType, { ubicar = ubicarDocumento } = {}) {
  if (!activo() || !TIPOS_IMAGEN.has(mimetype) || !NOMBRE_DOCUMENTO[docType]) return null;
  if (String(process.env.OCR_PROVIDER || 'mock').toLowerCase() !== 'gemini') return null;
  try {
    // La caja y el giro se piden sobre la foto ya orientada por EXIF.
    const { data: orientada, info } = await sharp(rutaOriginal).rotate().toBuffer({ resolveWithObject: true });
    const miniatura = await sharp(orientada)
      .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const limite = parseInt(process.env.OCR_RECORTE_TIMEOUT_MS, 10) || 12000;
    const hallazgo = await conLimite(ubicar(miniatura, docType), limite);
    if (!hallazgo?.encontrado) return null;

    const region = regionDeRecorte(hallazgo.caja, info.width, info.height);
    if (!region) return null;
    const giro = GIRO_POR_PARTE_SUPERIOR[hallazgo.parteSuperior] || 0;
    const recorta = (region.width * region.height) / (info.width * info.height) < AREA_SIN_RECORTE;
    if (!recorta && !giro) return null;

    let imagen = sharp(orientada);
    if (recorta) imagen = imagen.extract(region);
    // sharp aplica un solo giro por tubería: el recorte se materializa antes de girar.
    const recortada = await imagen.toBuffer();
    const salida = `${rutaOriginal}_recorte.webp`;
    await sharp(recortada)
      .rotate(giro)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .normalise()
      .sharpen({ sigma: 0.6 })
      .webp({ quality: 85 })
      .toFile(salida);
    console.log(`[OCR] recorte docType=${docType} recortado=${recorta} giro=${giro}`);
    return salida;
  } catch (err) {
    console.warn(`[OCR] recorte omitido docType=${docType}: ${err.message}`);
    return null;
  }
}

module.exports = { recortarDocumento, regionDeRecorte };

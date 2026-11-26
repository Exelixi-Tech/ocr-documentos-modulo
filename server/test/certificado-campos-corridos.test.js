/**
 * Carnet INTT gastado: campos corridos (serial = nombre del propietario, placa = modelo).
 * Casos reales de producción (oct–nov 2026). Sin llamadas reales a Gemini.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// @google/genai simulado: cada modelo responde lo que diga `respuestas[modelo]`.
const respuestas = {};
const llamadas = [];
const genaiPath = require.resolve('@google/genai');
const real = require('@google/genai');
require.cache[genaiPath].exports = {
  ...real,
  GoogleGenAI: class {
    constructor() {
      this.models = {
        generateContent: async ({ model }) => {
          llamadas.push(model);
          return { text: JSON.stringify(respuestas[model]) };
        },
      };
    }
  },
};
process.env.GEMINI_API_KEY = 'prueba';

const gemini = require('../src/services/geminiProvider');
const { normalizeCertificadoFields, motivoCampoCorrido } = gemini._internal;

const ENV = ['GEMINI_MODEL', 'GEMINI_MODELS'];
function limpiar() {
  for (const k of ENV) delete process.env[k];
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  llamadas.length = 0;
}
test.beforeEach(limpiar);
test.after(limpiar);

const QUINTERO_BUENO = {
  documentoTipo: 'certificado',
  tipoCarnet: 'nacional',
  placa: 'GCP64G',
  serial: '8XA11UJ8069022650',
  serialMotor: '1FZ0654321',
  marca: 'TOYOTA',
  modelo: 'LAND CRUISER AUT',
  anio: '2006',
  propietario: 'EDUARDO JOSE QUINTERO VELUTINI',
};
const QUINTERO_CORRIDO = {
  ...QUINTERO_BUENO,
  placa: 'LANDCRUISERAU',
  serial: 'EDUARDOJOSEQUINTEROVELUTINI',
};

test('cadena de emisión por defecto: pro primero, flash de respaldo (todos los documentos)', () => {
  assert.deepEqual(gemini.getModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
});

test('GEMINI_MODEL y GEMINI_MODELS siguen mandando sobre el default', () => {
  process.env.GEMINI_MODEL = 'gemini-3.6-flash';
  assert.deepEqual(gemini.getModelChain(), ['gemini-3.6-flash', 'gemini-3.1-pro-preview']);
  process.env.GEMINI_MODELS = 'gemini-3.1-pro-preview, gemini-3.6-flash';
  assert.deepEqual(gemini.getModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
});

test('Quintero: serial = propietario y placa = modelo → ambos null, el resto se conserva', () => {
  const f = normalizeCertificadoFields(structuredClone(QUINTERO_CORRIDO));
  assert.equal(f.serial, null);
  assert.equal(f.placa, null);
  assert.equal(f.serialMotor, '1FZ0654321');
  assert.equal(f.marca, 'TOYOTA');
  assert.deepEqual(f._camposDescartados, ['placa', 'serial']);
  assert.equal(JSON.stringify(f).includes('_camposDescartados'), false);
});

test('Quintero: la lectura correcta (GCP64G / 8XA11UJ8069022650) no se toca', () => {
  const f = normalizeCertificadoFields(structuredClone(QUINTERO_BUENO));
  assert.equal(f.placa, 'GCP64G');
  assert.equal(f.serial, '8XA11UJ8069022650');
  assert.equal(f.serialMotor, '1FZ0654321');
  assert.deepEqual(f._camposDescartados, []);
});

test('Torres: serial JHONSAMIRTORRESCHIRAPO → null; el VIN real 8123CAK1XRM294068 se conserva', () => {
  const base = {
    documentoTipo: 'certificado', tipoCarnet: 'nacional', placa: 'AB123CD', marca: 'BERA', modelo: 'SBR',
    serialMotor: '162FMJ26012345', propietario: 'JHON SAMIR TORRES CHIRAPOZU',
  };
  const malo = normalizeCertificadoFields({ ...base, serial: 'JHONSAMIRTORRESCHIRAPO' });
  assert.equal(malo.serial, null);
  assert.deepEqual(malo._camposDescartados, ['serial']);
  const bueno = normalizeCertificadoFields({ ...base, serial: '8123CAK1XRM294068' });
  assert.equal(bueno.serial, '8123CAK1XRM294068');
  assert.equal(bueno.placa, 'AB123CD');
});

test('motivoCampoCorrido: sin dígitos, propietario (o prefijo) y marca/modelo', () => {
  const ctx = { propietarios: ['MARIA3PEREZ', 'JHONSAMIRTORRESCHIRAPOZU'], marca: 'BERA', modelo: 'BR200-2' };
  assert.equal(motivoCampoCorrido('EDUARDOJOSE', ctx), 'sin_digitos');
  assert.equal(motivoCampoCorrido('NO PORTA', ctx), 'sin_digitos');
  assert.equal(motivoCampoCorrido('MARIA 3 PEREZ', ctx), 'es_propietario');
  assert.equal(motivoCampoCorrido('MARIA3', ctx), 'es_propietario');
  assert.equal(motivoCampoCorrido('BR2002', ctx), 'es_marca_modelo');
  assert.equal(motivoCampoCorrido('BERA BR200-2', ctx), 'es_marca_modelo');
  assert.equal(motivoCampoCorrido('988AAH', ctx), null);
  assert.equal(motivoCampoCorrido('8123CAK1XRM294068', ctx), null);
  assert.equal(motivoCampoCorrido(null, ctx), null);
});

test('serial de motor sin dígitos o igual al propietario → null', () => {
  const f = normalizeCertificadoFields({
    ...structuredClone(QUINTERO_BUENO), serialMotor: 'EDUARDO JOSE QUINTERO',
  });
  assert.equal(f.serialMotor, null);
  assert.equal(f.serial, '8XA11UJ8069022650');
  assert.deepEqual(f._camposDescartados, ['serialMotor']);
});

test('carnet extranjero (Colombia) no pasa por estos controles', () => {
  const f = normalizeCertificadoFields({
    documentoTipo: 'certificado', tipoCarnet: 'extranjero', placa: 'SWK284', marca: 'RENAULT',
    linea: 'LOGAN', modelo: '2023', vin: 'SINDIGITOS', propietario: 'PEREZ JUAN',
  });
  assert.equal(f._camposDescartados, undefined);
});

async function extraer() {
  const tmp = path.join(os.tmpdir(), `carnet-prueba-${process.pid}.jpg`);
  fs.writeFileSync(tmp, 'x');
  try {
    return await gemini.extract(tmp, 'image/jpeg', 'certificado');
  } finally {
    fs.unlinkSync(tmp);
  }
}

test('extract: campos corridos en el primer modelo → reintenta con el siguiente y devuelve la lectura buena', async () => {
  respuestas['gemini-3.1-pro-preview'] = QUINTERO_CORRIDO;
  respuestas['gemini-3.6-flash'] = QUINTERO_BUENO;
  const r = await extraer();
  assert.deepEqual(llamadas, ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
  assert.equal(r.meta.model, 'gemini-3.6-flash');
  assert.equal(r.fields.placa, 'GCP64G');
  assert.equal(r.fields.serial, '8XA11UJ8069022650');
  assert.deepEqual(r.meta.chainAttempts[0].descartados, ['placa', 'serial']);
  assert.equal(r.meta.chainAttempts[0].criticalOk, false);
});

test('extract: si toda la cadena lee corrido, devuelve la lectura con placa/serial en null (no el nombre)', async () => {
  respuestas['gemini-3.1-pro-preview'] = QUINTERO_CORRIDO;
  respuestas['gemini-3.6-flash'] = QUINTERO_CORRIDO;
  const r = await extraer();
  assert.equal(llamadas.length, 2);
  assert.equal(r.meta.partial, true);
  assert.equal(r.fields.placa, null);
  assert.equal(r.fields.serial, null);
  assert.equal(r.fields.marca, 'TOYOTA');
});

test('extract: lectura buena al primer intento no llama al segundo modelo', async () => {
  respuestas['gemini-3.1-pro-preview'] = QUINTERO_BUENO;
  const r = await extraer();
  assert.deepEqual(llamadas, ['gemini-3.1-pro-preview']);
  assert.equal(r.meta.partial, undefined);
  assert.equal(r.fields.placa, 'GCP64G');
});

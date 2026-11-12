/**
 * Monitor de expedientes: cadena de modelos PROPIA para la validación con IA (pro primero) y
 * auditoría del modelo usado. El escaneo de emisión conserva su cadena (GEMINI_MODEL/GEMINI_MODELS).
 * Sin llamadas reales a Gemini.
 */
process.env.OCR_PROVIDER = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../src/services/geminiProvider');
const documentService = require('../src/services/documentService');
const { _internal } = require('../src/routes/expedienteDocumento');

const ENV = ['GEMINI_MODELS_EXPEDIENTES', 'GEMINI_MODEL', 'GEMINI_MODELS'];
function limpiarEnv() {
  for (const k of ENV) delete process.env[k];
}
test.beforeEach(limpiarEnv);
test.after(limpiarEnv);

test('expedientes: sin variable, pro primero y flash de respaldo', () => {
  assert.deepEqual(gemini.getExpedientesModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
});

test('expedientes: GEMINI_MODELS_EXPEDIENTES reemplaza la cadena y no la afectan GEMINI_MODEL(S)', () => {
  process.env.GEMINI_MODEL = 'gemini-3.6-flash';
  process.env.GEMINI_MODELS = 'gemini-3.6-flash,gemini-3.1-pro-preview';
  assert.deepEqual(gemini.getExpedientesModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
  process.env.GEMINI_MODELS_EXPEDIENTES = ' gemini-3.1-pro-preview , gemini-3.7-flash,gemini-3.1-pro-preview ';
  assert.deepEqual(gemini.getExpedientesModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.7-flash']);
});

test('expedientes: se descartan los 2.5 retirados y gemini-3.8-flash; si no queda nada, el default', (t) => {
  t.mock.method(console, 'warn', () => {});
  process.env.GEMINI_MODELS_EXPEDIENTES = 'gemini-2.5-pro,gemini-3.8-flash,gemini-3.6-flash';
  assert.deepEqual(gemini.getExpedientesModelChain(), ['gemini-3.6-flash']);
  process.env.GEMINI_MODELS_EXPEDIENTES = 'gemini-2.5-flash,gemini-3.8-flash';
  assert.deepEqual(gemini.getExpedientesModelChain(), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
});

test('emisión no cambia: la cadena por defecto sigue siendo flash → pro', () => {
  process.env.GEMINI_MODELS_EXPEDIENTES = 'gemini-3.1-pro-preview';
  assert.deepEqual(gemini.getModelChain(), ['gemini-3.6-flash', 'gemini-3.1-pro-preview']);
});

test('extraer (expedientes) pide a runOcr la cadena de expedientes', async (t) => {
  process.env.GEMINI_MODELS_EXPEDIENTES = 'gemini-3.1-pro-preview,gemini-3.6-flash';
  const ocr = t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini',
    fields: { identificacion: '1' },
    meta: { model: 'gemini-3.1-pro-preview', chainAttempts: [{ model: 'gemini-3.1-pro-preview', criticalOk: true }] },
  }));
  const r = await _internal.extraer({ path: 'x', mimetype: 'image/png' }, 'cedula', { aceptaRif: true });
  const opts = ocr.mock.calls[0].arguments[3];
  assert.deepEqual(opts.modelChain, ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
  assert.equal(opts.aceptaRif, true);
  assert.equal(r.modelo, 'gemini-3.1-pro-preview');
  assert.deepEqual(r.modelos, [{ modelo: 'gemini-3.1-pro-preview', resultado: 'ok' }]);
  assert.equal(r.confianza, 1);
});

test('auditoría: flash con error y luego pro ok; cadena agotada sigue siendo falla técnica con los intentos', async (t) => {
  const conRespaldo = _internal.auditoriaModelo({
    meta: {
      model: 'gemini-3.6-flash',
      chainAttempts: [
        { model: 'gemini-3.1-pro-preview', error: 'timeout' },
        { model: 'gemini-3.6-flash', criticalOk: false },
      ],
    },
  });
  assert.deepEqual(conRespaldo, {
    modelo: 'gemini-3.6-flash',
    modelos: [
      { modelo: 'gemini-3.1-pro-preview', resultado: 'error' },
      { modelo: 'gemini-3.6-flash', resultado: 'parcial' },
    ],
  });

  t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini',
    fields: {},
    ocrFailed: true,
    meta: { chainAttempts: [{ model: 'gemini-3.1-pro-preview', error: '503' }, { model: 'gemini-3.6-flash', error: '503' }] },
  }));
  const r = await _internal.extraer({ path: 'x', mimetype: 'image/png' }, 'licencia', {});
  assert.equal(r.falla, 'tecnica');
  assert.equal(r.confianza, 0);
  assert.equal(r.extraido, null);
  assert.equal(r.modelo, undefined);
  assert.deepEqual(r.modelos.map((m) => m.resultado), ['error', 'error']);
});

test('runOcr con Gemini: pasa la cadena al proveedor y, si se agota, devuelve los intentos', async (t) => {
  process.env.OCR_PROVIDER = 'gemini';
  t.after(() => { process.env.OCR_PROVIDER = 'mock'; });
  t.mock.method(console, 'error', () => {});
  const err = Object.assign(new Error('cadena agotada'), {
    chainAttempts: [{ model: 'gemini-3.1-pro-preview', error: 'x' }],
  });
  const ext = t.mock.method(gemini, 'extract', async () => { throw err; });
  const r = await documentService.runOcr({ path: 'x', mimetype: 'image/png' }, 'cedula', null, {
    modelChain: ['gemini-3.1-pro-preview'],
  });
  assert.deepEqual(ext.mock.calls[0].arguments[3], { aceptaRif: false, modelChain: ['gemini-3.1-pro-preview'] });
  assert.equal(r.ocrFailed, true);
  assert.deepEqual(r.meta.chainAttempts, err.chainAttempts);

  // Emisión (sin modelChain): el proveedor recibe solo aceptaRif, como antes.
  await documentService.runOcr({ path: 'x', mimetype: 'image/png' }, 'cedula', null, {});
  assert.deepEqual(ext.mock.calls[1].arguments[3], { aceptaRif: false });
});

/**
 * OCR opcional por productor (frontend/src/lib/ocr-opcional.ts).
 * El front no tiene runner propio: se prueba la librería pura desde aquí. Un Node que no
 * importa .ts sin flags (< 23.6) omite la suite en vez de fallar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const LIB = pathToFileURL(
  path.resolve(__dirname, '../../frontend/src/lib/ocr-opcional.ts'),
).href;

async function cargar(t) {
  try {
    return await import(LIB);
  } catch (err) {
    t.skip(`este Node no importa TypeScript: ${err.code || err.message}`);
    return null;
  }
}

const cfg = (ocrOpcional) => ({ ocrOpcional });

test('productor listado → OCR opcional (centidad P + citem)', async (t) => {
  const lib = await cargar(t);
  if (!lib) return;
  const config = cfg({ gestores: [], canales: [], productores: ['1234'] });
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: '1234' }), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'p', citem: ' 1234 ' }), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: 1234 }), true);
  // Sesión sin canal ni punto que solo trae cproductor.
  assert.equal(lib.isOcrOpcionalForActor(config, { cproductor: '1234' }), true);
});

test('productor no listado o match parcial → obligatorio', async (t) => {
  const lib = await cargar(t);
  if (!lib) return;
  const config = cfg({ gestores: [], canales: [], productores: ['1234'] });
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: '999' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: '12345' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: '123' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, {}), false);
  assert.equal(lib.isOcrOpcionalForActor(config, null), false);
});

test('el cproductor de una sesión de canal o punto NO relaja el OCR', async (t) => {
  const lib = await cargar(t);
  if (!lib) return;
  const config = cfg({ gestores: [], canales: [], productores: ['1234'] });
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'C', citem: '7', cproductor: '1234' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { ccanalalt_in: '7', cproductor: '1234' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { cgestor: '215-28', cproductor: '1234' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'G', citem: '215-28', cproductor: '1234' }), false);
  // Un canal cuyo código coincide con un cproductor listado tampoco entra.
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'C', citem: '1234' }), false);
});

test('config sin productores (formato anterior): canales y gestores igual que antes', async (t) => {
  const lib = await cargar(t);
  if (!lib) return;
  const config = cfg({ gestores: ['215-28'], canales: ['7'] });
  assert.equal(lib.isOcrOpcionalForActor(config, { ccanalalt: '7' }), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'C', citem: '7' }), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { cgestor: '215-28' }), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { cgestor: '300' }, 7), true);
  assert.equal(lib.isOcrOpcionalForActor(config, { cgestor: '300' }, 8), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { centidad: 'P', citem: '7' }), false);
  assert.equal(lib.isOcrOpcionalForActor(config, { cproductor: '7' }), false);
  assert.equal(lib.cgestorParaHeredarCanal(config, { cgestor: '300' }), '300');
  assert.equal(lib.isOcrOpcionalForActor(cfg({ productores: 'x' }), { centidad: 'P', citem: 'x' }), false);
  assert.equal(lib.isOcrOpcionalForActor({}, { centidad: 'P', citem: '1' }), false);
});

test('cproductorDelActor: solo cuando el actor es productor', async (t) => {
  const lib = await cargar(t);
  if (!lib) return;
  assert.equal(lib.cproductorDelActor({ centidad: 'P', citem: '55', cproductor: '1' }), '55');
  assert.equal(lib.cproductorDelActor({ centidad: 'P', cproductor: '55' }), '55');
  assert.equal(lib.cproductorDelActor({ cproductor: 55 }), '55');
  assert.equal(lib.cproductorDelActor({ centidad: 'C', citem: '7', cproductor: '55' }), '');
  assert.equal(lib.cproductorDelActor({ csubitem: '80080-1', cproductor: '55' }), '');
  assert.equal(lib.cproductorDelActor(undefined), '');
});

/** Recorte previo a la lectura: solo actúa cuando es seguro y nunca rompe la carga. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { recortarDocumento, regionDeRecorte } = require('../src/services/documentCrop');

// En Windows la caché de sharp mantiene abiertos los archivos que luego se reescriben o borran.
sharp.cache(false);

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recorte-'));
const FOTO = path.join(DIR, 'foto.jpg');

test.before(async () => {
  await sharp({ create: { width: 1000, height: 2000, channels: 3, background: '#888' } }).jpeg().toFile(FOTO);
});
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
test.beforeEach(() => {
  process.env.OCR_RECORTE = 'on';
  process.env.OCR_PROVIDER = 'gemini';
});

const hallazgo = (v) => ({ ubicar: async () => v });
const recortar = (v, tipo = 'certificado', mime = 'image/jpeg') => recortarDocumento(FOTO, mime, tipo, hallazgo(v));

test('region: aplica margen y no sale de la imagen', () => {
  assert.deepEqual(regionDeRecorte([0, 100, 500, 900], 1000, 2000), { left: 60, top: 0, width: 880, height: 1080 });
});

test('region: descarta cajas invertidas, diminutas o mal formadas', () => {
  assert.equal(regionDeRecorte([500, 100, 100, 900], 1000, 1000), null);
  assert.equal(regionDeRecorte([0, 0, 100, 100], 1000, 1000), null);
  assert.equal(regionDeRecorte([0, 0, 500], 1000, 1000), null);
  assert.equal(regionDeRecorte(undefined, 1000, 1000), null);
});

test('recorta el documento sin tocar la foto original', async () => {
  const antes = fs.readFileSync(FOTO);
  const salida = await recortar({ encontrado: true, caja: [250, 100, 750, 900], giro: 0 });
  const m = await sharp(salida).metadata();
  assert.deepEqual([m.width, m.height], [880, 1160]);
  assert.ok(antes.equals(fs.readFileSync(FOTO)));
});

test('endereza: letras apuntando a un lado intercambian ancho y alto', async () => {
  const salida = await recortar({ encontrado: true, caja: [250, 100, 750, 900], parteSuperior: 'derecha' }, 'cedula');
  const m = await sharp(salida).metadata();
  assert.deepEqual([m.width, m.height], [1160, 880]);
});

test('endereza en el sentido correcto: lo que apuntaba a la derecha queda arriba', async () => {
  const marcada = path.join(DIR, 'marcada.png');
  const rojo = await sharp({ create: { width: 100, height: 400, channels: 3, background: '#f00' } }).png().toBuffer();
  await sharp({ create: { width: 800, height: 400, channels: 3, background: '#00f' } })
    .composite([{ input: rojo, left: 700, top: 0 }]).png().toFile(marcada);
  const salida = await recortarDocumento(marcada, 'image/png', 'cedula',
    hallazgo({ encontrado: true, caja: [0, 0, 1000, 1000], parteSuperior: 'derecha' }));
  const { data, info } = await sharp(salida).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels).subarray(0, 3)];
  const [arriba, abajo] = [pixel(info.width >> 1, 20), pixel(info.width >> 1, info.height - 20)];
  assert.ok(arriba[0] > arriba[2], 'arriba debe ser rojo');
  assert.ok(abajo[2] > abajo[0], 'abajo debe ser azul');
});

test('null: no encontrado, ya encuadrado, PDF, tipo sin recorte', async () => {
  assert.equal(await recortar({ encontrado: false }), null);
  assert.equal(await recortar({ encontrado: true, caja: [0, 0, 1000, 1000], giro: 0 }), null);
  const ok = { encontrado: true, caja: [250, 100, 750, 900] };
  assert.equal(await recortar(ok, 'certificado', 'application/pdf'), null);
  assert.equal(await recortar(ok, 'factura'), null);
});

test('null si está apagado: no llama al modelo', async () => {
  delete process.env.OCR_RECORTE;
  let llamadas = 0;
  const r = await recortarDocumento(FOTO, 'image/jpeg', 'cedula', { ubicar: async () => { llamadas++; } });
  assert.equal(r, null);
  assert.equal(llamadas, 0);
});

test('null si el modelo falla o tarda demasiado', async () => {
  const falla = { ubicar: async () => { throw new Error('503'); } };
  assert.equal(await recortarDocumento(FOTO, 'image/jpeg', 'cedula', falla), null);
  process.env.OCR_RECORTE_TIMEOUT_MS = '20';
  const lento = { ubicar: () => new Promise((r) => setTimeout(r, 200, { encontrado: false })) };
  assert.equal(await recortarDocumento(FOTO, 'image/jpeg', 'cedula', lento), null);
  delete process.env.OCR_RECORTE_TIMEOUT_MS;
});

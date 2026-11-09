/**
 * GET /api/catalog/gestor-canal: canal alterno de un punto de comercialización (magestor) para que
 * el OCR herede el «OCR opcional» del canal. Match exacto; sin catálogo → 502 (queda obligatorio).
 */
process.env.NEST_API_URL = 'http://nest.test';
process.env.NEST_APIKEY = 'clave-prueba';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const express = require('express');

let upstream = null;
let llamadas = 0;
axios.get = async (url) => {
  llamadas += 1;
  assert.equal(url, 'http://nest.test/api/v1/canal/actores');
  if (upstream instanceof Error) throw upstream;
  return upstream;
};

const router = require('../src/routes/catalog');

const app = express();
app.use('/api/catalog', router);
let server;
let base;

const CATALOGO = {
  status: 200,
  data: {
    status: true,
    data: {
      canales: [{ ccanalalt: 215, xcanalalt: 'Canal 215', ctipocanal: null }],
      gestores: [
        { cgestor: '215-1195-4215', xgestor: 'Punto', ccanalalt: 215, cscanalalt: null },
        { cgestor: '80080-1159-3002', xgestor: 'Productor', ccanalalt: null, cscanalalt: null },
      ],
    },
  },
};

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/catalog/gestor-canal`;
});
test.after(() => server.close());
test.beforeEach(() => {
  router._resetActoresCache();
  llamadas = 0;
  upstream = CATALOGO;
});

async function get(cgestor) {
  const qs = cgestor === undefined ? '' : `?cgestor=${encodeURIComponent(cgestor)}`;
  const res = await fetch(`${base}${qs}`);
  return { status: res.status, body: await res.json() };
}

test('devuelve solo el canal del punto (match exacto)', async () => {
  const r = await get('215-1195-4215');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, data: { ccanalalt: 215 } });
});

test('punto de productor o desconocido → null; sin prefijos', async () => {
  assert.deepEqual((await get('80080-1159-3002')).body, { success: true, data: null });
  assert.deepEqual((await get('215-1195')).body, { success: true, data: null });
  assert.deepEqual((await get('215')).body, { success: true, data: null });
});

test('usa la caché: varias consultas, una sola llamada al Core', async () => {
  await Promise.all([get('215-1195-4215'), get('215-1195-4215'), get('x')]);
  await get('215-1195-4215');
  assert.equal(llamadas, 1);
});

test('sin cgestor → 400', async () => {
  assert.equal((await get()).status, 400);
  assert.equal((await get('  ')).status, 400);
});

test('Core caído sin caché → 502 (fail-safe)', async () => {
  upstream = new Error('ECONNREFUSED');
  const r = await get('215-1195-4215');
  assert.equal(r.status, 502);
  assert.equal(r.body.success, false);
});

test('Core responde error sin caché → 502', async () => {
  upstream = { status: 403, data: { status: false } };
  assert.equal((await get('215-1195-4215')).status, 502);
});

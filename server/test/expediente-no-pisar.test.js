/**
 * pendiente/ es compartida por todas las emisiones de una cédula/RIF (p. ej. una empresa tomadora con
 * muchos empleados). Nunca se sobrescribe un documento, y al archivar una póliza solo se mueven los
 * archivos de esa emisión (no los de otras emisiones del mismo tomador).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'expedientes-no-pisar-'));
const ROOT = path.join(BASE_DIR, 'root');
fs.mkdirSync(ROOT, { recursive: true });
process.env.EXPEDIENTES_ROOT = ROOT;

const test = require('node:test');
const assert = require('node:assert/strict');
const expedienteFs = require('../src/lib/expedienteFs');

const LM = 'La Mundial de Seguros';
const RIF = '500585039';

function temporal(contenido) {
  const p = path.join(BASE_DIR, `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(p, contenido);
  return p;
}

const pendiente = () => path.join(ROOT, LM, RIF, 'pendiente');

test('dos emisiones del mismo tomador no se pisan la cédula', async () => {
  const a = await expedienteFs.placePending(temporal('cedula-empleado-A'), { empresaNombre: LM, cedula: RIF, docType: 'cedula' });
  // Pausa mínima para que el sufijo por fecha no coincida.
  await new Promise((r) => setTimeout(r, 5));
  const b = await expedienteFs.placePending(temporal('cedula-empleado-B'), { empresaNombre: LM, cedula: RIF, docType: 'cedula' });

  assert.notEqual(a.absPath, b.absPath);
  assert.equal(fs.readFileSync(a.absPath, 'utf8'), 'cedula-empleado-A');
  assert.equal(fs.readFileSync(b.absPath, 'utf8'), 'cedula-empleado-B');
  assert.equal(path.basename(a.absPath), 'cedula.pdf');
  assert.match(path.basename(b.absPath), /^cedula-\d+(-\d+)?\.pdf$/);
  assert.match(b.url, /^\/files\/La%20Mundial%20de%20Seguros\/500585039\/pendiente\/cedula-\d+/);
});

test('al archivar una póliza solo se mueven sus archivos; los de otras emisiones quedan en pendiente/', async () => {
  const propio = await expedienteFs.placePending(temporal('cedula-empleado-C'), { empresaNombre: LM, cedula: RIF, docType: 'cedula' });
  const antes = fs.readdirSync(pendiente()).sort();

  const r = await expedienteFs.commitExpediente({
    empresaNombre: LM,
    cedula: RIF,
    nomenclatura: '7-7-7000009999',
    files: [{ url: propio.url, docType: 'cedula' }],
  });

  const destino = path.join(ROOT, LM, RIF, '7-7-7000009999');
  assert.deepEqual(fs.readdirSync(destino), ['cedula.pdf']);
  assert.equal(fs.readFileSync(path.join(destino, 'cedula.pdf'), 'utf8'), 'cedula-empleado-C');
  assert.deepEqual(r.saved, ['cedula.pdf']);

  // Los archivos de A y B siguen en pendiente/, intactos.
  const despues = fs.readdirSync(pendiente()).sort();
  assert.deepEqual(despues, antes.filter((n) => n !== path.basename(propio.absPath)));
  assert.ok(despues.length >= 2);
  const contenidos = despues.map((n) => fs.readFileSync(path.join(pendiente(), n), 'utf8')).sort();
  assert.deepEqual(contenidos, ['cedula-empleado-A', 'cedula-empleado-B']);
});

test('pendiente/ vacía se borra al archivar', async () => {
  const CI = '12345678';
  const p = await expedienteFs.placePending(temporal('solo'), { empresaNombre: LM, cedula: CI, docType: 'licencia' });
  await expedienteFs.commitExpediente({
    empresaNombre: LM, cedula: CI, nomenclatura: '18-1-1', files: [{ url: p.url, docType: 'licencia' }],
  });
  assert.equal(fs.existsSync(path.join(ROOT, LM, CI, 'pendiente')), false);
});

/**
 * pendiente/ es compartida por todas las emisiones de una cédula/RIF (p. ej. una empresa tomadora con
 * muchos empleados). Nunca se sobrescribe un documento, y al archivar una póliza se COPIAN solo los
 * archivos de esa emisión: pendiente/ no se toca, porque sus archivos pueden estar enlazados desde
 * otros expedientes de Nexus (24-nov: las pólizas 7-7 y 9-7 del mismo empleado compartían archivo y
 * mover el archivo al pagar una dejaba roto el enlace de la otra).
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

test('al archivar una póliza se copian solo sus archivos; pendiente/ queda intacta', async () => {
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

  // pendiente/ no cambia: los de A y B y el propio (copiado, no movido) siguen ahí, intactos.
  const despues = fs.readdirSync(pendiente()).sort();
  assert.deepEqual(despues, antes);
  const contenidos = despues.map((n) => fs.readFileSync(path.join(pendiente(), n), 'utf8')).sort();
  assert.deepEqual(contenidos, ['cedula-empleado-A', 'cedula-empleado-B', 'cedula-empleado-C']);
});

test('pendiente/ se conserva al archivar (el archivo se copia, no se mueve)', async () => {
  const CI = '12345678';
  const p = await expedienteFs.placePending(temporal('solo'), { empresaNombre: LM, cedula: CI, docType: 'licencia' });
  await expedienteFs.commitExpediente({
    empresaNombre: LM, cedula: CI, nomenclatura: '18-1-1', files: [{ url: p.url, docType: 'licencia' }],
  });
  assert.equal(fs.readFileSync(p.absPath, 'utf8'), 'solo');
  assert.equal(fs.readFileSync(path.join(ROOT, LM, CI, '18-1-1', 'licencia.pdf'), 'utf8'), 'solo');
});

test('dos pólizas que comparten el archivo de pendiente/: al pagar una, el enlace de la otra sigue válido', async () => {
  const CI = '17000001';
  // Mismo asegurado, pólizas 7-7 y 9-7 con el mismo documento (como en Nexus: misma URL).
  const p = await expedienteFs.placePending(temporal('cedula-del-empleado'), { empresaNombre: LM, cedula: CI, docType: 'cedula' });
  const r1 = await expedienteFs.commitExpediente({
    empresaNombre: LM, cedula: CI, nomenclatura: '1-26-11-7000001001', files: [{ url: p.url, docType: 'cedula' }],
  });
  assert.deepEqual(r1.saved, ['cedula.pdf']);
  // La URL que guarda Nexus para la otra póliza sigue resolviendo al archivo.
  const sigue = expedienteFs.resolveLocalPathFromUrl(p.url);
  assert.ok(sigue && fs.existsSync(sigue));
  assert.equal(fs.readFileSync(sigue, 'utf8'), 'cedula-del-empleado');
  // Al pagar la segunda, también se archiva con el mismo archivo.
  const r2 = await expedienteFs.commitExpediente({
    empresaNombre: LM, cedula: CI, nomenclatura: '2-26-11-7000001002', files: [{ url: p.url, docType: 'cedula' }],
  });
  assert.deepEqual(r2.saved, ['cedula.pdf']);
  assert.equal(r2.skipped, 0);
  for (const carpeta of ['1-26-11-7000001001', '2-26-11-7000001002']) {
    assert.equal(fs.readFileSync(path.join(ROOT, LM, CI, carpeta, 'cedula.pdf'), 'utf8'), 'cedula-del-empleado');
  }
  assert.ok(fs.existsSync(p.absPath));
});

test('reintento del archivado: no duplica ni pisa lo que ya está en la carpeta de la póliza', async () => {
  const CI = '17000009';
  const p = await expedienteFs.placePending(temporal('cedula-9'), { empresaNombre: LM, cedula: CI, docType: 'cedula' });
  const datos = { empresaNombre: LM, cedula: CI, nomenclatura: '3-26-11-7000009009', files: [{ url: p.url, docType: 'cedula' }] };
  await expedienteFs.commitExpediente(datos);
  const r = await expedienteFs.commitExpediente(datos);
  assert.deepEqual(r.saved, ['cedula.pdf']);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, LM, CI, '3-26-11-7000009009')), ['cedula.pdf']);
  // Otro archivo con el mismo nombre en la carpeta: se guarda aparte, sin pisar.
  const otro = await expedienteFs.placePending(temporal('cedula-9-nueva'), { empresaNombre: LM, cedula: CI, docType: 'cedula' });
  const r3 = await expedienteFs.commitExpediente({ ...datos, files: [{ url: otro.url, docType: 'cedula' }] });
  assert.match(r3.saved[0], /^cedula-\d+(-\d+)?\.pdf$/);
  assert.equal(fs.readFileSync(path.join(ROOT, LM, CI, '3-26-11-7000009009', 'cedula.pdf'), 'utf8'), 'cedula-9');
});

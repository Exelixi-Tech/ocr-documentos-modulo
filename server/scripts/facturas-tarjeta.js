#!/usr/bin/env node
/**
 * Facturas de tarjeta (bfactura=1): verificación y recuperación de emergencia.
 * Runbook: docs/RUNBOOK-FACTURA-TARJETA.md
 *
 *   node scripts/facturas-tarjeta.js verificar [--dias 7]   # solo lectura; exit 1 si hay pólizas sin factura
 *   node scripts/facturas-tarjeta.js asociar <foto> <expediente>   # copia la foto como factura.* (no borra el original)
 *
 * Se corre desde server/ (lee server/.env: EXPEDIENTES_ROOT y EXPEDIENTE_PUBLIC_BASE).
 */
const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch { /* sin dotenv: usa el entorno */ }

const ROOT = path.resolve(process.env.EXPEDIENTES_ROOT || path.join(__dirname, '..', 'uploads'));
const BASE = String(process.env.EXPEDIENTE_PUBLIC_BASE || '').trim().replace(/\/$/, '');
const H = 3600e3;
const VENTANA_INBOX = 3 * H;   // foto en _inbox: emisión hasta 3 h después
const VENTANA_CEDULA = 72 * H; // foto en pendiente/: emisión de esa cédula hasta 3 días después

const mtime = (p) => fs.statSync(p).mtimeMs;
const subdirs = (p) => {
  try { return fs.readdirSync(p).filter((n) => fs.statSync(path.join(p, n)).isDirectory()); } catch { return []; }
};
const esFactura = (f) => f.toLowerCase().startsWith('factura');
const fecha = (ms) => {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
};
const link = (abs) => `${BASE}/files/${path.relative(ROOT, abs).split(path.sep).map(encodeURIComponent).join('/')}`;
const leerJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };

function escanear() {
  const huerfanas = [];
  const expedientes = [];
  for (const emp of subdirs(ROOT)) {
    if (emp === '_tmp' || emp === 'shared') continue;
    const ep = path.join(ROOT, emp);
    for (const ced of subdirs(ep)) {
      const cp = path.join(ep, ced);
      if (ced === '_inbox') {
        for (const f of fs.readdirSync(cp).filter(esFactura)) {
          huerfanas.push({ t: mtime(path.join(cp, f)), ruta: path.join(cp, f), cedula: null });
        }
        continue;
      }
      for (const nom of subdirs(cp)) {
        const xp = path.join(cp, nom);
        const files = fs.readdirSync(xp);
        if (nom === 'pendiente') {
          for (const f of files.filter(esFactura)) {
            huerfanas.push({ t: mtime(path.join(xp, f)), ruta: path.join(xp, f), cedula: ced });
          }
          continue;
        }
        const jp = path.join(xp, 'documentos.json');
        const d = fs.existsSync(jp) ? leerJson(jp) : {};
        expedientes.push({
          t: fs.existsSync(jp) ? mtime(jp) : mtime(xp),
          ruta: xp,
          cedula: ced,
          cnpoliza: d.cnpoliza || nom.split('-').pop(),
          nfactura: d.nfactura || '',
          // factura_requerida la manda Emisión desde el 27-oct; antes solo se sabe por nfactura (incluye autopago).
          requerida: d.factura_requerida === true ? 'sí' : d.factura_requerida === false ? 'no' : (d.nfactura ? 'revisar' : 'no'),
          tieneFactura: files.some(esFactura),
        });
      }
    }
  }
  return { huerfanas, expedientes };
}

function verificar(dias) {
  const desde = Date.now() - dias * 24 * H;
  const { huerfanas, expedientes } = escanear();
  const sinFactura = expedientes.filter((e) => e.t >= desde && !e.tieneFactura && e.requerida !== 'no');

  console.log(`== Pólizas con factura de tarjeta y SIN foto archivada (últimos ${dias} días) ==`);
  if (!sinFactura.length) console.log('(ninguna)');
  for (const e of sinFactura.sort((a, b) => a.t - b.t)) {
    console.log(`${fecha(e.t)} | ${e.cnpoliza} | cédula ${e.cedula} | nfactura ${e.nfactura || '-'} | requerida=${e.requerida} | ${path.relative(ROOT, e.ruta)}`);
  }

  console.log('\n== Fotos de factura sueltas y la póliza probable ==');
  const usados = new Set();
  const candidatosSinFactura = expedientes.filter((e) => !e.tieneFactura);
  let sueltas = 0;
  for (const h of huerfanas.filter((x) => x.t >= desde - VENTANA_CEDULA).sort((a, b) => a.t - b.t)) {
    sueltas += 1;
    const cands = (h.cedula
      ? candidatosSinFactura.filter((e) => e.cedula === h.cedula && e.t >= h.t - 5 * 60e3 && e.t <= h.t + VENTANA_CEDULA)
      : candidatosSinFactura.filter((e) => e.nfactura && e.requerida !== 'no' && e.t >= h.t && e.t <= h.t + VENTANA_INBOX))
      .sort((a, b) => a.t - b.t)
      .filter((e) => !usados.has(e.ruta));
    const foto = path.relative(ROOT, h.ruta);
    if (!cands.length) { console.log(`${fecha(h.t)} | ${foto} | sin emisión (flujo abandonado)`); continue; }
    cands.slice(0, 3).forEach((e, i) => console.log(
      `${fecha(h.t)} | ${foto} | -> ${e.cnpoliza} (${fecha(e.t)}) | ${path.relative(ROOT, e.ruta)} | `
      + `${i > 0 ? 'otra candidata' : h.cedula ? 'misma cédula' : 'por hora: VERIFICAR viendo la foto'}`,
    ));
    if (h.cedula) usados.add(cands[0].ruta);
  }
  if (!sueltas) console.log('(ninguna)');

  const problemas = sinFactura.filter((e) => e.requerida === 'sí').length;
  console.log(`\nResultado: ${problemas} póliza(s) con factura obligatoria sin foto; ${sinFactura.length - problemas} por revisar (puede ser autopago).`);
  return problemas ? 1 : 0;
}

function asociar(foto, expediente) {
  const src = path.resolve(foto);
  const dir = path.resolve(expediente);
  if (!src.startsWith(ROOT + path.sep) || !dir.startsWith(ROOT + path.sep)) {
    console.error(`Las rutas deben estar dentro de ${ROOT}`);
    return 2;
  }
  if (!fs.existsSync(src) || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`NO EXISTE: ${foto} o ${expediente}`);
    return 2;
  }
  const yaTiene = fs.readdirSync(dir).find(esFactura);
  if (yaTiene) { console.error(`YA TIENE ${yaTiene}: ${expediente}`); return 2; }

  const nombre = `factura${path.extname(src) || '.webp'}`;
  const dest = path.join(dir, nombre);
  fs.copyFileSync(src, dest);
  fs.utimesSync(dest, fs.statSync(src).atime, fs.statSync(src).mtime);

  const jp = path.join(dir, 'documentos.json');
  const d = fs.existsSync(jp) ? leerJson(jp) : {};
  d.archivos = { ...(d.archivos || {}), [nombre]: link(dest) };
  d.factura_recuperada = { origen: path.relative(ROOT, src), fecha: new Date().toISOString(), motivo: 'factura asociada a mano (runbook)' };
  fs.writeFileSync(jp, JSON.stringify(d, null, 2), 'utf8');
  console.log(`OK ${d.cnpoliza || path.basename(dir)} ${link(dest)}`);
  return 0;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'verificar') {
  const i = args.indexOf('--dias');
  process.exitCode = verificar(i >= 0 ? Number(args[i + 1]) || 7 : 7);
} else if (cmd === 'asociar' && args.length === 2) {
  process.exitCode = asociar(args[0], args[1]);
} else {
  console.error('Uso: node scripts/facturas-tarjeta.js verificar [--dias N] | asociar <foto> <expediente>');
  process.exitCode = 2;
}

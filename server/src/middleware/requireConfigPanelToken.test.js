const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const requireConfigPanelToken = require('./requireConfigPanelToken');

const TENANT = 'tenant-secret-de-prueba';
const PANEL = 'panel-secret-de-prueba';

function run(authorization) {
  const out = { status: 200, nextCalled: false, body: null };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; },
  };
  requireConfigPanelToken({ headers: { authorization } }, res, () => { out.nextCalled = true; });
  return out;
}

function withSecrets(tenant, panel, fn) {
  const prev = {
    TENANT_TOKEN_SECRET: process.env.TENANT_TOKEN_SECRET,
    NEXUS_JWT_SECRET: process.env.NEXUS_JWT_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  delete process.env.NEXUS_JWT_SECRET;
  if (tenant) process.env.TENANT_TOKEN_SECRET = tenant; else delete process.env.TENANT_TOKEN_SECRET;
  if (panel) process.env.JWT_SECRET = panel; else delete process.env.JWT_SECRET;
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test('sin token responde 401', () => {
  withSecrets(TENANT, PANEL, () => {
    const r = run(undefined);
    assert.equal(r.status, 401);
    assert.equal(r.nextCalled, false);
  });
});

test('token firmado con otro secreto responde 401', () => {
  withSecrets(TENANT, PANEL, () => {
    const token = jwt.sign({ scope: 'config-panel' }, 'secreto-ajeno');
    const r = run(`Bearer ${token}`);
    assert.equal(r.status, 401);
    assert.equal(r.nextCalled, false);
  });
});

test('un tenant_access valido no alcanza: responde 403', () => {
  withSecrets(TENANT, PANEL, () => {
    const token = jwt.sign({ type: 'tenant_access', empresaId: 7, submoduloId: 17 }, TENANT);
    const r = run(`Bearer ${token}`);
    assert.equal(r.status, 403);
    assert.equal(r.nextCalled, false);
  });
});

test('token config-panel firmado con JWT_SECRET pasa', () => {
  withSecrets(TENANT, PANEL, () => {
    const token = jwt.sign({ scope: 'config-panel', empresaId: 7 }, PANEL);
    const r = run(`Bearer ${token}`);
    assert.equal(r.nextCalled, true);
  });
});

test('sin secretos configurados falla cerrado con 500', () => {
  withSecrets(null, null, () => {
    const token = jwt.sign({ scope: 'config-panel' }, PANEL);
    const r = run(`Bearer ${token}`);
    assert.equal(r.status, 500);
    assert.equal(r.nextCalled, false);
  });
});

'use strict';

const DEFAULT_APP_ID = 'rcv-nexus';

function getMonitorAppId() {
  return (process.env.MONITOR_APP_ID || DEFAULT_APP_ID).trim();
}

function reportRuntimeError(payload) {
  if (process.env.MONITOR_REPORT_ENABLED !== 'true') return;

  const url = process.env.MONITOR_REPORT_URL;
  const token = process.env.MONITOR_INGEST_TOKEN;
  if (!url || !token) {
    console.warn('[monitor] MONITOR_REPORT_ENABLED=true pero falta MONITOR_REPORT_URL o MONITOR_INGEST_TOKEN');
    return;
  }

  const body = {
    ...payload,
    appId: payload.appId || getMonitorAppId(),
    at: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-monitor-ingest-token': token,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .catch((err) => {
      console.debug('[monitor] report failed:', err instanceof Error ? err.message : String(err));
    })
    .finally(() => clearTimeout(timer));
}

function reportExpressError(err, req, overrides = {}) {
  const statusCode = Number(err?.status) || 500;
  if (statusCode < 500) return;

  const path = (req?.originalUrl || req?.url || '/').split('?')[0] || '/';
  reportRuntimeError({
    appId: getMonitorAppId(),
    method: (req?.method || 'GET').toUpperCase().slice(0, 16),
    path,
    statusCode,
    message: String(err?.message || 'Error').slice(0, 1000),
    errorName: err?.name,
    stackPreview: err?.stack ? String(err.stack).slice(0, 1200) : undefined,
    blocksUser: true,
    ...overrides,
  });
}

function getNestMonitorAppIdHeader() {
  return { 'x-monitor-app-id': getMonitorAppId() };
}

module.exports = {
  reportRuntimeError,
  reportExpressError,
  getMonitorAppId,
  getNestMonitorAppIdHeader,
};

// Structured client-side error logging. Canceled requests (AbortController) are
// intentionally silent — they are the normal result of fast navigation.

const PREFIX = '[EthioBridge]';

const isCancellation = (err) =>
  !!(err && (err.code === 'ERR_CANCELED' || err.code === 'ERR_ABORTED' || err.name === 'AbortError'));

export const logError = (scope, err, extra) => {
  if (isCancellation(err)) return;
  const detail = {
    scope,
    url: err?.config?.url || err?.config?.baseURL || '',
    method: err?.config?.method ? String(err.config.method).toUpperCase() : '',
    status: err?.response?.status || null,
    code: err?.code || null,
    message: err?.message || '',
    ...(extra || {}),
  };
  console.error(`${PREFIX} API error (${scope}):`, detail);
};

export const logWarn = (scope, message, extra) => {
  console.warn(`${PREFIX} (${scope}):`, message, extra || '');
};

// User-friendly messages mapped from the error classification in requestUtils.
import { classifyError } from './requestUtils';

export const ERROR_MESSAGES = {
  offline: 'You appear to be offline. Showing cached data.',
  timeout: 'The server is taking too long to respond. Please try again.',
  server: 'The server is temporarily unavailable. Please try again shortly.',
  rate_limit: 'Too many requests. Please wait a moment and try again.',
  notfound: 'Nothing was found for this request.',
  forbidden: 'You do not have permission to view this data.',
  unauthorized: 'Your session has expired. Please sign in again.',
  unknown: 'Could not load data. Please try again.',
};

export const errorMessageFor = (err) => {
  const { kind } = classifyError(err);
  return ERROR_MESSAGES[kind] || ERROR_MESSAGES.unknown;
};

// Error kinds that warrant a toast. Auth / permission / not-found errors are
// handled gracefully in-place (redirect, empty state, "no data") instead.
export const isToastableErrorKind = (kind) =>
  !['unauthorized', 'forbidden', 'notfound'].includes(kind);

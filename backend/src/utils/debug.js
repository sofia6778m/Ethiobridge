/**
 * logDebug — console logging gated to non-production environments.
 * Sensitive debug logs (emails, roles, bcrypt compare results) must never
 * reach production output, so all login/auth diagnostics go through this.
 */
const logDebug = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

module.exports = { logDebug };

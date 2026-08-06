/**
 * slaRules.js — resolves the response deadline (slaDueAt) for a governance
 * complaint from the category-based SlaRule collection.
 *
 * Precedence (see models/SlaRule.js):
 *   1. rule keyed to the complaint category, scoped to the complaint subcity
 *   2. rule keyed to the complaint category, global (subcityId null)
 *   3. the 'default' rule (global fallback)
 *   4. 48-hour hardcoded fallback (kept for safety / legacy records)
 */
const SlaRule = require('../models/SlaRule');

const FALLBACK_RESPONSE_DAYS = 2; // 48h

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const normalizeKey = (s) => String(s || '').trim().toLowerCase();

/**
 * @param {string} categoryName  denormalized category string on the complaint
 * @param {ObjectId|string|null} subcityId  complaint subcity id (may be null for legacy)
 * @param {Date} [from]  anchor time (defaults to now) — createdAt on the complaint
 * @returns {Promise<Date>} the response deadline
 */
const resolveSlaDueAt = async (categoryName, subcityId, from = new Date()) => {
  const key = normalizeKey(categoryName);
  const anchor = from instanceof Date && !Number.isNaN(from.getTime()) ? from : new Date();

  const rules = await SlaRule.find({
    isActive: true,
    key: { $in: [key, 'default'] },
  }).lean();

  const subcityKey = subcityId == null ? null : String(subcityId);
  const byCategory = rules.find((r) => r.key === key);
  const subOverride =
    byCategory && byCategory.subcityId && subcityKey && String(byCategory.subcityId) === subcityKey;
  const globalByCategory = byCategory && !byCategory.subcityId;
  const defaultRule = rules.find((r) => r.key === 'default' && !r.subcityId);

  const rule = subOverride || globalByCategory || defaultRule;
  const days = rule ? Number(rule.responseDays) : FALLBACK_RESPONSE_DAYS;
  if (!Number.isFinite(days) || days <= 0) {
    return new Date(anchor.getTime() + FALLBACK_RESPONSE_DAYS * DAY_MS);
  }
  return new Date(anchor.getTime() + days * DAY_MS);
};

module.exports = { resolveSlaDueAt, FALLBACK_RESPONSE_DAYS };

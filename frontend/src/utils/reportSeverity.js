/**
 * reportSeverity.js — severity level → color mapping used for the heat-map
 * markers on the Issue Location map.
 */

export const SEVERITY_COLORS = {
  Low: '#22c55e',
  Medium: '#eab308',
  High: '#f97316',
  Critical: '#ef4444',
};

export const SEVERITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];

export const SEVERITY_LEGEND = SEVERITY_ORDER.map((v) => ({ value: v, color: SEVERITY_COLORS[v] }));

export function severityColor(level) {
  return SEVERITY_COLORS[level] || '#64748b';
}

export function severityRank(level) {
  const idx = SEVERITY_ORDER.indexOf(level);
  return idx === -1 ? 0 : idx;
}

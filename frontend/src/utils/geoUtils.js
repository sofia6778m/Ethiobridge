/**
 * geoUtils.js — small pure helpers for the GIS location feature.
 */

const EARTH_RADIUS_M = 6371000;

// Great-circle distance in meters (Haversine formula).
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// True when the point is inside the given {south, west, north, east} bounds.
export function isWithinBounds(lat, lng, bounds) {
  if (!bounds) return true;
  return lat >= bounds.south && lat <= bounds.north
    && lng >= bounds.west && lng <= bounds.east;
}

export function clampToBounds(lat, lng, bounds) {
  if (!bounds) return { lat, lng };
  return {
    lat: Math.min(Math.max(lat, bounds.south), bounds.north),
    lng: Math.min(Math.max(lng, bounds.west), bounds.east),
  };
}

export function formatAccuracy(meters) {
  if (meters == null || Number.isNaN(Number(meters))) return '';
  const m = Number(meters);
  if (m < 1) return '<1m';
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

/**
 * Computes per-Subcity / Woreda / Category / Issue-Level counts for a list of
 * reports (used by the Issue Location statistics panel). `subcityFor` is an
 * optional callback `(report) => subcityName | null` used when a report has no
 * explicit `subcity` field (e.g. deriving it from coordinates).
 */
export function computeReportStats(reports, subcityFor = null) {
  const list = (reports || []).filter((r) => r && typeof r === 'object');

  const countBy = (get) => {
    const counts = new Map();
    for (const r of list) {
      const k = get(r);
      const key = k == null || String(k).trim() === '' ? 'Unspecified' : String(k).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    total: list.length,
    subcity: countBy((r) => r.subcity || (subcityFor ? subcityFor(r) : null)),
    woreda: countBy((r) => r.woredaName || r.woreda || null),
    category: countBy((r) => r.category || null),
    level: countBy((r) => r.severityLevel || r.level || null),
  };
}

/**
 * Clusters reports into grid buckets sized by the current zoom so markers group
 * together when the map is zoomed out. Uses Leaflet's projection so buckets are
 * consistent in screen space. Each returned entry is either a single report or
 * a cluster `{ isCluster: true, reports, latitude, longitude }`.
 */
export function clusterReports(reports, zoom, map, cellPx = 56) {
  const list = (reports || []).filter((r) => {
    if (r.latitude == null || r.longitude == null) return false;
    if (String(r.latitude).trim() === '' || String(r.longitude).trim() === '') return false;
    return Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude));
  });
  if (list.length === 0) return [];
  if (!map) return list.map((r) => ({ isCluster: false, reports: [r], latitude: Number(r.latitude), longitude: Number(r.longitude) }));

  const buckets = new Map();
  for (const r of list) {
    const p = map.project([Number(r.latitude), Number(r.longitude)], zoom);
    const key = `${Math.floor(p.x / cellPx)},${Math.floor(p.y / cellPx)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const out = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      const r = bucket[0];
      out.push({ isCluster: false, reports: bucket, latitude: Number(r.latitude), longitude: Number(r.longitude) });
    } else {
      out.push({
        isCluster: true,
        reports: bucket,
        latitude: bucket.reduce((s, r) => s + Number(r.latitude), 0) / bucket.length,
        longitude: bucket.reduce((s, r) => s + Number(r.longitude), 0) / bucket.length,
      });
    }
  }
  return out;
}

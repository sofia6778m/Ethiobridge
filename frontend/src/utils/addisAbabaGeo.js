/**
 * addisAbabaGeo.js — geographic reference data for the GIS "Issue Location" map.
 *
 * Designed to scale: every city is described by a CITY entry (boundary ring,
 * bounds, centre, zoom, subcities + woreda counts). Only enabled cities are
 * served by the helpers, so adding a future Ethiopian city is a matter of
 * adding an entry to CITIES and setting `enabled: true` — no call-site changes.
 *
 * Subcity polygons are hand-authored near-real shapes; woreda boundaries are
 * generated deterministically as a grid over each subcity's bounding box
 * (illustrative — the app has no authoritative woreda geometry).
 * All polygons are [lng, lat] rings.
 */

// ── Addis Ababa reference data ────────────────────────────────────────────────
// Outer boundary ring for the Addis Ababa city area (approx).
export const ADDIS_BOUNDARY = [
  [38.62, 9.11], [38.72, 9.11], [38.80, 9.11], [38.93, 9.10],
  [38.95, 9.01], [38.93, 8.94], [38.95, 8.80], [38.78, 8.80],
  [38.67, 8.86], [38.62, 9.01], [38.62, 9.11],
];

// Map bounds (south, west, north, east) used to lock panning to the city.
export const ADDIS_BOUNDS = { south: 8.78, west: 38.60, north: 9.13, east: 38.98 };

export const ADDIS_CENTER = [9.02, 38.76];

export const ADDIS_DEFAULT_ZOOM = 12;

export const ADDIS_SUBCITIES = [
  {
    key: 'GULLELE',
    name: 'Gullele',
    woredaCount: 10,
    polygon: [[38.64, 9.11], [38.72, 9.11], [38.74, 9.06], [38.70, 9.04], [38.64, 9.06]],
  },
  {
    key: 'ADDIS_KETEMA',
    name: 'Addis Ketema',
    woredaCount: 9,
    polygon: [[38.74, 9.11], [38.80, 9.10], [38.80, 9.05], [38.74, 9.05]],
  },
  {
    key: 'ARADA',
    name: 'Arada',
    woredaCount: 10,
    polygon: [[38.71, 9.05], [38.77, 9.05], [38.77, 9.00], [38.71, 9.00]],
  },
  {
    key: 'YEKA',
    name: 'Yeka',
    woredaCount: 13,
    polygon: [[38.80, 9.11], [38.93, 9.10], [38.95, 9.01], [38.80, 9.02]],
  },
  {
    key: 'LEMI_KURA',
    name: 'Lemi Kura',
    woredaCount: 13,
    polygon: [[38.82, 9.02], [38.95, 9.01], [38.93, 8.94], [38.82, 8.95]],
  },
  {
    key: 'BOLE',
    name: 'Bole',
    woredaCount: 14,
    polygon: [[38.75, 9.00], [38.88, 9.00], [38.90, 8.93], [38.75, 8.93]],
  },
  {
    key: 'KIRKOS',
    name: 'Kirkos',
    woredaCount: 11,
    polygon: [[38.71, 9.00], [38.76, 9.00], [38.76, 8.94], [38.71, 8.94]],
  },
  {
    key: 'LIDETA',
    name: 'Lideta',
    woredaCount: 10,
    polygon: [[38.66, 9.00], [38.71, 9.00], [38.71, 8.94], [38.66, 8.94]],
  },
  {
    key: 'KOLFE_KERANIO',
    name: 'Kolfe Keranio',
    woredaCount: 14,
    polygon: [[38.62, 9.06], [38.71, 9.05], [38.71, 9.00], [38.66, 9.00], [38.62, 9.01]],
  },
  {
    key: 'NIFAS_SILK_LAFTO',
    name: 'Nifas Silk-Lafto',
    woredaCount: 10,
    polygon: [[38.67, 8.94], [38.76, 8.94], [38.76, 8.85], [38.67, 8.86]],
  },
  {
    key: 'AKAKI_KALITY',
    name: 'Akaki Kality',
    woredaCount: 11,
    polygon: [[38.76, 8.94], [38.93, 8.93], [38.95, 8.80], [38.78, 8.80]],
  },
];

// ── Geometry helpers ──────────────────────────────────────────────────────────

// Ray-casting point-in-polygon test. `polygon` is a [[lng, lat], ...] ring.
export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function subcityBBox(sc) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of sc.polygon) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

// ── City registry (future Ethiopian cities slot in here) ──────────────────────
export const CITIES = [
  {
    key: 'ADDIS_ABABA',
    name: 'Addis Ababa',
    enabled: true,
    boundary: ADDIS_BOUNDARY,
    bounds: ADDIS_BOUNDS,
    center: ADDIS_CENTER,
    defaultZoom: ADDIS_DEFAULT_ZOOM,
    subcities: ADDIS_SUBCITIES,
  },
  // Example for a future city (keep `enabled: false` until it is live):
  // {
  //   key: 'HAWASSA',
  //   name: 'Hawassa',
  //   enabled: false,
  //   boundary: [...],
  //   bounds: { south: 7.0, west: 38.4, north: 7.1, east: 38.55 },
  //   center: [7.05, 38.47],
  //   defaultZoom: 13,
  //   subcities: [...],
  // },
];

export const ACTIVE_CITY = CITIES.find((c) => c.enabled) || CITIES[0];

export const getCity = (key) => (key ? CITIES.find((c) => c.key === key) : null) || ACTIVE_CITY;

export const getActiveCity = () => ACTIVE_CITY;

// Convenience aliases bound to the active city (Addis Ababa today).
export const SUBCITIES = ACTIVE_CITY.subcities;
export const ALL_WOREDA_CELLS = ACTIVE_CITY.subcities.flatMap((sc) => buildWoredaCells(sc.key, ACTIVE_CITY.key));

// ── City-scoped detection / cells ─────────────────────────────────────────────

export function isInsideCity(lat, lng, cityKey) {
  return pointInPolygon(lat, lng, getCity(cityKey).boundary);
}

// Backward-compatible alias (Addis Ababa).
export const isInsideAddis = (lat, lng) => isInsideCity(lat, lng, 'ADDIS_ABABA');

export function detectSubcity(lat, lng, cityKey) {
  const city = getCity(cityKey);
  if (!pointInPolygon(lat, lng, city.boundary)) return null;
  for (let i = 0; i < city.subcities.length; i++) {
    if (pointInPolygon(lat, lng, city.subcities[i].polygon)) return city.subcities[i];
  }
  return null;
}

export function getSubcity(cityKey, subcityKey) {
  return getCity(cityKey).subcities.find((s) => s.key === subcityKey) || null;
}

// Builds an illustrative woreda grid for a subcity (row-major, top → bottom).
export function buildWoredaCells(subcityKey, cityKey) {
  const sc = getCity(cityKey).subcities.find((s) => s.key === subcityKey);
  if (!sc) return [];
  const { minLng, minLat, maxLng, maxLat } = subcityBBox(sc);
  const cols = Math.max(1, Math.ceil(Math.sqrt(sc.woredaCount)));
  const rows = Math.ceil(sc.woredaCount / cols);
  const cellLng = (maxLng - minLng) / cols;
  const cellLat = (maxLat - minLat) / rows;
  const cells = [];
  for (let i = 0; i < sc.woredaCount; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const lng1 = minLng + c * cellLng;
    const lng2 = minLng + (c + 1) * cellLng;
    const lat2 = maxLat - r * cellLat;
    const lat1 = maxLat - (r + 1) * cellLat;
    cells.push({
      id: `${sc.key}-W${i + 1}`,
      key: sc.key,
      index: i,
      label: `Woreda ${i + 1}`,
      bbox: { minLng: lng1, minLat: lat1, maxLng: lng2, maxLat: lat2 },
      polygon: [[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2]],
    });
  }
  return cells;
}

// 0-based woreda grid index for a point inside a subcity, or -1.
export function woredaCellIndexFor(lat, lng, subcityKey, cityKey) {
  const cells = buildWoredaCells(subcityKey, cityKey);
  for (let i = 0; i < cells.length; i++) {
    const { minLng, minLat, maxLng, maxLat } = cells[i].bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) return i;
  }
  return -1;
}

export function getWoredaCell(cityKey, subcityKey, woredaIndex) {
  const cells = buildWoredaCells(subcityKey, cityKey);
  return cells.find((c) => c.index === Number(woredaIndex)) || null;
}

// A large polygon with a hole for the active city, used to dim the surrounding
// area so the rest of Ethiopia is not visible on the map.
export function cityMaskPolygon(cityKey) {
  const city = getCity(cityKey);
  const b = city.bounds;
  const pad = 0.5;
  const outer = [
    [b.west - pad, b.south - pad],
    [b.east + pad, b.south - pad],
    [b.east + pad, b.north + pad],
    [b.west - pad, b.north + pad],
  ];
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [outer, [...city.boundary, city.boundary[0]]],
    },
  };
}

// Builds a GeoJSON FeatureCollection from an array of `{ id, polygon, properties }`.
export function toFeatureCollection(items) {
  return {
    type: 'FeatureCollection',
    features: (items || []).map((it, i) => ({
      type: 'Feature',
      id: it.id != null ? it.id : i,
      properties: { ...(it.properties || {}) },
      geometry: {
        type: 'Polygon',
        coordinates: [[...it.polygon, it.polygon[0]]],
      },
    })),
  };
}

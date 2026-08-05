import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'react-toastify';
import { infraAPI } from '../../services/api';
import BoundaryLayers from './BoundaryLayers';
import ReportHeatmapMarkers from './ReportHeatmapMarkers';
import {
  getActiveCity, isInsideCity, detectSubcity, woredaCellIndexFor,
} from '../../utils/addisAbabaGeo';
import { formatAccuracy, computeReportStats } from '../../utils/geoUtils';
import { SEVERITY_LEGEND, SEVERITY_COLORS } from '../../utils/reportSeverity';

const GPS_ERRORS = {
  1: 'Location permission was denied. Enable location access and try again.',
  2: 'Your current location is unavailable right now.',
  3: 'Timed out while getting your location. Try again.',
};

const OUTSIDE_AA_TOAST = {
  map: 'Selected location is outside Addis Ababa. Please choose a location within Addis Ababa.',
  gps: 'This platform currently accepts Infrastructure Reports only within Addis Ababa.',
};

// Reverse geocodes via OpenStreetMap's public Nominatim service. Falls back to
// the local boundary detection when the service is unreachable.
async function reverseGeocode(lat, lng) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    return {
      street: a.road || a.pedestrian || a.cycleway || a.footway || '',
      landmark: a.attraction || a.tourist || a.building || a.amenity || a.quarter || a.neighbourhood || '',
      address: (data.display_name || '')
        .split(',')
        .slice(0, 4)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', '),
      addressSubcity: a.suburb || a.city_district || a.town || a.city || '',
    };
  } catch {
    return null;
  }
}

function ClickHandler({ onSelect }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e) => onSelect(e.latlng.lat, e.latlng.lng);
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onSelect]);
  return null;
}

function MapFlyTo({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [lat, lng, map]);
  return null;
}

const selectedPinIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="34" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 16 12 16s12-7.6 12-16C24 5.4 18.6 0 12 0z" fill="#4f46e5" stroke="#fff" stroke-width="2"/>
    <circle cx="12" cy="12" r="4.5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 34],
  iconAnchor: [14, 32],
  popupAnchor: [0, -30],
});

function LegendRow({ label, style }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm shrink-0" style={style} />
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
    </li>
  );
}

const humanize = (key) => String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function StatsColumn({ title, rows, colorize }) {
  const top = rows.slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">—</p>
      ) : (
        <ul className="space-y-1">
          {top.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-xs">
              {colorize && SEVERITY_COLORS[r.key] && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_COLORS[r.key] }} />
              )}
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{humanize(r.key)}</span>
              <span className="h-1.5 w-8 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden shrink-0">
                <span className="block h-full bg-primary-500" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
              </span>
              <span className="text-gray-400 tabular-nums w-6 text-right">{r.count}</span>
            </li>
          ))}
          {rows.length > top.length && (
            <li className="text-[10px] text-gray-400">…and {rows.length - top.length} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * IssueLocationPicker — GIS "Issue Location" section.
 *
 * Lets the user either use the browser's GPS or click the map to place a pin,
 * then auto-detects subcity / woreda / coordinates / street / accuracy. The map
 * is locked to Addis Ababa (panning/zooming constrained, rest of Ethiopia
 * dimmed), shows subcity + woreda boundaries with the selected ones highlighted,
 * and overlays existing infrastructure reports as severity-coloured (heat map)
 * markers with clustering plus a small statistics panel. Emits changes via
 * `onChange({ latitude, longitude, accuracy, ... })`.
 */
export default function IssueLocationPicker({ value = {}, onChange }) {
  const activeCity = getActiveCity();
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [existingReports, setExistingReports] = useState([]);
  const [selectedMsg, setSelectedMsg] = useState(false);
  const [draftLat, setDraftLat] = useState(null);
  const [draftLng, setDraftLng] = useState(null);
  const msgTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    infraAPI.getPublic({ limit: 200 })
      .then((res) => {
        if (!alive) return;
        setExistingReports(
          (res.data?.reports || [])
            .filter((r) => r.latitude != null && r.longitude != null
              && String(r.latitude).trim() !== '' && String(r.longitude).trim() !== '')
            .map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) })),
        );
      })
      .catch(() => { /* markers are optional */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => clearTimeout(msgTimer.current), []);

  const showSelectedMsg = () => {
    setSelectedMsg(true);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setSelectedMsg(false), 4000);
  };

  const processLocation = useCallback(async (lat, lng, accuracy, timestamp, source = 'map') => {
    if (!isInsideCity(lat, lng, activeCity.key)) {
      toast.info(OUTSIDE_AA_TOAST[source] || OUTSIDE_AA_TOAST.map);
      return;
    }
    setGeocoding(true);
    try {
      const local = detectSubcity(lat, lng, activeCity.key);
      const geo = await reverseGeocode(lat, lng);
      const woredaIndex = local ? woredaCellIndexFor(lat, lng, local.key, activeCity.key) : -1;
      const detectedWoreda = woredaIndex >= 0 ? `Woreda ${woredaIndex + 1}` : '';
      const subcity = local?.name || geo?.addressSubcity || '';
      const street = geo?.street || '';
      const landmark = geo?.landmark || '';
      const address = geo?.address || [local?.name, street, detectedWoreda].filter(Boolean).join(', ');
      onChange({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy: accuracy != null ? Number(accuracy) : null,
        timestamp: timestamp || Date.now(),
        address,
        street,
        landmark,
        subcity,
        detectedWoreda,
        woredaIndex,
      });
      showSelectedMsg();
      toast.success('Location selected successfully.');
    } finally {
      setGeocoding(false);
    }
  }, [onChange, activeCity]);

  const handleMapSelect = useCallback((lat, lng) => {
    processLocation(lat, lng, null, null, 'map');
  }, [processLocation]);

  const handleGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        processLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp, 'gps');
      },
      (err) => {
        setLocating(false);
        toast.error(GPS_ERRORS[err.code] || 'Unable to get your current location.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const commitManualCoords = () => {
    const rawLat = draftLat !== null ? draftLat : value.latitude;
    const rawLng = draftLng !== null ? draftLng : value.longitude;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      processLocation(lat, lng, value.accuracy, value.timestamp, 'map');
    }
    setDraftLat(null);
    setDraftLng(null);
  };

  const hasLocation = Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
  const markerPos = hasLocation ? [Number(value.latitude), Number(value.longitude)] : null;
  const accuracyMeters = Number(value.accuracy);

  // Selected subcity / woreda cell (highlighted on the map).
  const selectedSubcity = useMemo(() => {
    if (!value.subcity) return null;
    const name = String(value.subcity).trim().toLowerCase();
    return activeCity.subcities.find((sc) => sc.name.toLowerCase() === name) || null;
  }, [value.subcity, activeCity]);

  // Per Subcity / Woreda / Category / Issue Level counts from existing reports.
  const stats = useMemo(
    () => computeReportStats(
      existingReports,
      (r) => detectSubcity(r.latitude, r.longitude, activeCity.key)?.name || null,
    ),
    [existingReports, activeCity],
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={handleGps}
          disabled={locating}
          className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {locating ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Getting location…
            </>
          ) : (
            <>
              <span>📍</span>
              Use Current GPS Location
            </>
          )}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          or tap anywhere on the map to place a marker.
        </span>
        {geocoding && (
          <span className="text-xs text-primary-600 dark:text-primary-300 font-medium flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            Detecting location…
          </span>
        )}
      </div>

      {/* Coordinates / detection readout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Latitude</span>
          <input
            type="number"
            step="any"
            value={draftLat !== null ? draftLat : (value.latitude ?? '')}
            onChange={(e) => setDraftLat(e.target.value)}
            onBlur={commitManualCoords}
            onKeyDown={(e) => e.key === 'Enter' && commitManualCoords()}
            placeholder="9.020000"
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Longitude</span>
          <input
            type="number"
            step="any"
            value={draftLng !== null ? draftLng : (value.longitude ?? '')}
            onChange={(e) => setDraftLng(e.target.value)}
            onBlur={commitManualCoords}
            onKeyDown={(e) => e.key === 'Enter' && commitManualCoords()}
            placeholder="38.760000"
            className="input-field"
          />
        </label>
        <div className="block">
          <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Accuracy</span>
          <div className="input-field flex items-center text-gray-700 dark:text-gray-200">
            {accuracyMeters ? `±${formatAccuracy(accuracyMeters)}` : '—'}
          </div>
        </div>
        <div className="block">
          <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Timestamp</span>
          <div className="input-field flex items-center text-gray-700 dark:text-gray-200 truncate">
            {value.timestamp ? new Date(value.timestamp).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {/* Auto-detected place info */}
      <div className="flex flex-wrap gap-2 text-xs">
        {value.subcity && (
          <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full px-3 py-1 border border-blue-200 dark:border-blue-800">
            Subcity: <strong>{value.subcity}</strong>
          </span>
        )}
        {value.detectedWoreda && (
          <span className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-full px-3 py-1 border border-indigo-200 dark:border-indigo-800">
            Woreda: <strong>{value.detectedWoreda}</strong>
          </span>
        )}
        {value.street && (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-full px-3 py-1 border border-emerald-200 dark:border-emerald-800">
            Street: <strong>{value.street}</strong>
          </span>
        )}
        {value.landmark && (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-full px-3 py-1 border border-amber-200 dark:border-amber-800">
            Nearby: <strong>{value.landmark}</strong>
          </span>
        )}
        {!hasLocation && (
          <span className="text-gray-400 dark:text-gray-500">No location selected yet.</span>
        )}
      </div>

      {/* Confirmation message */}
      {selectedMsg && hasLocation && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span>✅</span> Location selected successfully.
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <MapContainer
          center={activeCity.center}
          zoom={activeCity.defaultZoom}
          minZoom={activeCity.defaultZoom}
          maxZoom={18}
          maxBounds={L.latLngBounds(
            [activeCity.bounds.south, activeCity.bounds.west],
            [activeCity.bounds.north, activeCity.bounds.east],
          )}
          maxBoundsViscosity={1.0}
          style={{ height: '340px', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundaryLayers
            selectedSubcityKey={selectedSubcity?.key || null}
            selectedWoredaIndex={value.woredaIndex != null ? Number(value.woredaIndex) : null}
          />
          <ReportHeatmapMarkers reports={existingReports} />
          <ClickHandler onSelect={handleMapSelect} />
          {markerPos && <MapFlyTo lat={Number(value.latitude)} lng={Number(value.longitude)} />}
          {markerPos && (
            <>
              {accuracyMeters > 0 && (
                <Circle
                  center={markerPos}
                  radius={accuracyMeters}
                  pathOptions={{ color: '#4f46e5', weight: 1, fillColor: '#4f46e5', fillOpacity: 0.08 }}
                />
              )}
              <Marker position={markerPos} icon={selectedPinIcon}>
                <Popup>
                  <div className="text-xs min-w-[150px]">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">Selected issue location</p>
                    <p className="text-gray-500 mt-0.5">{Number(value.latitude).toFixed(5)}, {Number(value.longitude).toFixed(5)}</p>
                    {value.subcity && <p className="text-gray-500">{value.subcity}{value.detectedWoreda ? ` · ${value.detectedWoreda}` : ''}</p>}
                    {value.street && <p className="text-gray-400">{value.street}</p>}
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        {/* Floating legend */}
        <ul className="absolute top-2 right-2 z-[500] bg-white/95 dark:bg-gray-800/95 rounded-lg shadow p-2 space-y-1 text-[10px]">
          <li className="font-bold text-gray-700 dark:text-gray-200 pb-0.5">Issue density</li>
          {SEVERITY_LEGEND.map((l) => (
            <LegendRow key={l.value} label={l.value} style={{ background: l.color }} />
          ))}
          <LegendRow label="Cluster" style={{ background: '#111827' }} />
          <li className="pt-1 border-t border-gray-200 dark:border-gray-700" />
          <LegendRow label="Subcity" style={{ border: '1.5px solid #2563eb', background: 'transparent' }} />
          <LegendRow label="Woreda" style={{ border: '1px solid #94a3b8', background: 'transparent' }} />
        </ul>
      </div>

      {/* Area statistics */}
      {stats.total > 0 && (
        <details className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
          <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
            <span>📊 Area report statistics</span>
            <span className="text-xs text-gray-400 tabular-nums">{stats.total} reports</span>
          </summary>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
            <StatsColumn title="By Subcity" rows={stats.subcity} />
            <StatsColumn title="By Woreda" rows={stats.woreda} />
            <StatsColumn title="By Category" rows={stats.category} />
            <StatsColumn title="By Issue Level" rows={stats.level} colorize />
          </div>
        </details>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        The map is limited to Addis Ababa. Markers show previously reported infrastructure issues in the area.
      </p>
    </div>
  );
}

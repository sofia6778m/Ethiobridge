import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { severityColor } from '../../utils/reportSeverity';
import { clusterReports } from '../../utils/geoUtils';

const MARKER_SIZE = 16;

const reportIcon = (level) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${severityColor(level)};width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  });

const clusterIcon = (count) =>
  L.divIcon({
    className: '',
    html: `<div style="background:#111827;color:#fff;width:34px;height:34px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const sync = () => setZoom(map.getZoom());
    map.on('zoomend', sync);
    return () => { map.off('zoomend', sync); };
  }, [map]);
  return zoom;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function ReportRow({ r }) {
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0 py-1.5">
      <p className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-gray-400 font-semibold">{r.reportId || r._id || '—'}</span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 dark:text-gray-300"
          title={`Severity: ${r.severityLevel || 'Unknown'}`}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: severityColor(r.severityLevel) }} />
          {r.severityLevel || '—'}
        </span>
      </p>
      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{r.title || 'Untitled report'}</p>
      <p className="text-[10px] text-gray-400 flex items-center gap-2">
        <span>{r.status || '—'}</span>
        <span>·</span>
        <span>{formatDate(r.createdAt)}</span>
      </p>
    </div>
  );
}

/**
 * Renders existing infrastructure reports as severity-coloured markers, grouped
 * into clusters when zoomed out. Popups are read-only (tracking ID, title,
 * status, submitted date).
 */
export default function ReportHeatmapMarkers({ reports = [] }) {
  const map = useMap();
  const zoom = useMapZoom();

  const entries = useMemo(
    () => clusterReports(reports, zoom, map),
    [reports, zoom, map],
  );

  return entries.map((entry, i) => (
    <Marker
      key={`${entry.isCluster ? 'c' : 'r'}-${i}`}
      position={[entry.latitude, entry.longitude]}
      icon={entry.isCluster ? clusterIcon(entry.reports.length) : reportIcon(entry.reports[0].severityLevel)}
    >
      <Popup>
        <div className="min-w-[180px] max-w-[240px]">
          {entry.isCluster ? (
            <>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                {entry.reports.length} reports in this area
              </p>
              <div className="max-h-40 overflow-y-auto">
                {entry.reports.slice(0, 8).map((r) => <ReportRow key={r._id || r.reportId} r={r} />)}
                {entry.reports.length > 8 && (
                  <p className="text-[10px] text-gray-400 pt-1">…and {entry.reports.length - 8} more</p>
                )}
              </div>
            </>
          ) : (
            <ReportRow r={entry.reports[0]} />
          )}
        </div>
      </Popup>
    </Marker>
  ));
}

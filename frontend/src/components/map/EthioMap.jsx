import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const typeColors = {
  infrastructure: '#3b82f6',
  emergency: '#ef4444',
  missing_person: '#f59e0b',
};

const createIcon = (type) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${typeColors[type] || '#6b7280'};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

export default function EthioMap({ markers = [], center = [9.145, 40.489], zoom = 6, height = '400px' }) {
  const { t } = useTranslation();
  return (
    <div style={{ height }} className="w-full rounded-xl overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((m, i) => (
          <Marker key={i} position={[m.latitude, m.longitude]} icon={createIcon(m.type)}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{m.title || m.fullName}</p>
                <p className="text-gray-600">{m.region || m.lastKnownRegion}</p>
                <p className="capitalize text-xs text-gray-500 mt-1">{m.type?.replace('_', ' ')}</p>
                {m.status && <p className="text-xs mt-1">{t('dashboard.mapStatus')}: <strong>{m.status}</strong></p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export function LocationPicker({ onLocationSelect, position }) {
  const { t } = useTranslation();
  function ClickHandler() {
    const map = useMap();
    useEffect(() => {
      const handler = (e) => {
        onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      };
      map.on('click', handler);
      return () => { map.off('click', handler); };
    }, [map, onLocationSelect]);
    return null;
  }

  return (
    <div className="w-full rounded-xl overflow-hidden border border-gray-200" style={{ height: '300px' }}>
      <MapContainer center={[9.145, 40.489]} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler />
        {position && <Marker position={[position.lat, position.lng]} />}
      </MapContainer>
      <p className="text-xs text-gray-500 mt-1">{t('dashboard.clickMapToSelect')}</p>
    </div>
  );
}

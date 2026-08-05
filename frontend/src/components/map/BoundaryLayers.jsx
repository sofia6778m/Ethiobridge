import { GeoJSON } from 'react-leaflet';
import {
  getActiveCity, cityMaskPolygon, toFeatureCollection, SUBCITIES, ALL_WOREDA_CELLS,
} from '../../utils/addisAbabaGeo';

const SUB_CITY_STYLE = {
  color: '#2563eb',
  weight: 1.5,
  opacity: 0.9,
  fillColor: '#60a5fa',
  fillOpacity: 0.05,
};

const SELECTED_SUB_CITY_STYLE = {
  color: '#4f46e5',
  weight: 2.5,
  opacity: 1,
  fillColor: '#6366f1',
  fillOpacity: 0.35,
};

const WOREDA_STYLE = {
  color: '#94a3b8',
  weight: 0.7,
  opacity: 0.8,
  fill: false,
};

const SELECTED_WOREDA_STYLE = {
  color: '#4f46e5',
  weight: 1.5,
  opacity: 1,
  fillColor: '#818cf8',
  fillOpacity: 0.5,
};

const MASK_STYLE = {
  color: '#0f172a',
  weight: 0,
  fillColor: '#0f172a',
  fillOpacity: 0.4,
};

// Dims the whole map outside the active city so the rest of Ethiopia is not
// visible while users are choosing a location.
export function CityMaskLayer() {
  return (
    <GeoJSON
      interactive={false}
      data={cityMaskPolygon(getActiveCity().key)}
      style={MASK_STYLE}
    />
  );
}

export function AddisAbabaBoundary() {
  return (
    <GeoJSON
      interactive={false}
      data={toFeatureCollection([{ id: 'addis-ababa', polygon: getActiveCity().boundary }])}
      style={{ color: '#7c3aed', weight: 2.5, opacity: 1, fill: false }}
    />
  );
}

export function SubcityBoundaries({ selectedKey }) {
  return (
    <GeoJSON
      interactive={false}
      data={toFeatureCollection(SUBCITIES.map((sc) => ({ id: sc.key, polygon: sc.polygon })))}
      style={(feature) => (
        selectedKey && feature.id === selectedKey
          ? { ...SUB_CITY_STYLE, ...SELECTED_SUB_CITY_STYLE }
          : SUB_CITY_STYLE
      )}
    />
  );
}

export function WoredaBoundaries({ selectedKey, selectedIndex }) {
  const highlight = (feature) => (
    selectedKey
    && selectedIndex != null
    && feature.properties?.subcity === selectedKey
    && feature.properties?.woredaIndex === Number(selectedIndex)
  );
  return (
    <GeoJSON
      interactive={false}
      data={toFeatureCollection(ALL_WOREDA_CELLS.map((c) => ({
        id: c.id,
        polygon: c.polygon,
        properties: { subcity: c.key, woredaIndex: c.index },
      })))}
      style={(feature) => (
        highlight(feature)
          ? { ...WOREDA_STYLE, ...SELECTED_WOREDA_STYLE }
          : WOREDA_STYLE
      )}
    />
  );
}

export default function BoundaryLayers({ showWoredas = true, selectedSubcityKey = null, selectedWoredaIndex = null }) {
  return (
    <>
      <CityMaskLayer />
      <AddisAbabaBoundary />
      <SubcityBoundaries selectedKey={selectedSubcityKey} />
      {showWoredas && <WoredaBoundaries selectedKey={selectedSubcityKey} selectedIndex={selectedWoredaIndex} />}
    </>
  );
}

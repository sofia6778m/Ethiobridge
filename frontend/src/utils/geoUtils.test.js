import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMeters, isWithinBounds, clampToBounds, formatAccuracy, clusterReports,
  computeReportStats,
} from './geoUtils';

describe('haversineDistanceMeters', () => {
  it('returns ~0 for identical coordinates', () => {
    expect(haversineDistanceMeters(9.02, 38.76, 9.02, 38.76)).toBeCloseTo(0, 6);
  });

  it('approximates 0.001° of longitude near Addis Ababa (~110m)', () => {
    const d = haversineDistanceMeters(9.02, 38.76, 9.02, 38.761);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it('is symmetric', () => {
    const a = haversineDistanceMeters(9.02, 38.76, 9.05, 38.80);
    const b = haversineDistanceMeters(9.05, 38.80, 9.02, 38.76);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('isWithinBounds / clampToBounds', () => {
  const bounds = { south: 8.78, west: 38.6, north: 9.13, east: 38.98 };

  it('checks bounds membership', () => {
    expect(isWithinBounds(9.02, 38.76, bounds)).toBe(true);
    expect(isWithinBounds(12, 38.76, bounds)).toBe(false);
  });

  it('clamps out-of-range coordinates', () => {
    expect(clampToBounds(12, 40, bounds)).toEqual({ lat: 9.13, lng: 38.98 });
    expect(clampToBounds(8.9, 38.7, bounds)).toEqual({ lat: 8.9, lng: 38.7 });
  });
});

describe('formatAccuracy', () => {
  it('formats metres', () => {
    expect(formatAccuracy(100)).toBe('100m');
    expect(formatAccuracy(0.4)).toBe('<1m');
    expect(formatAccuracy(null)).toBe('');
    expect(formatAccuracy('12')).toBe('12m');
  });
});

describe('clusterReports', () => {
  const fakeMap = { project: (p) => ({ x: p[1] * 1000, y: p[0] * 1000 }) };

  it('falls back to single markers without a map', () => {
    const out = clusterReports([
      { latitude: 9.0, longitude: 38.7, title: 'A' },
      { latitude: 9.1, longitude: 38.9, title: 'B' },
    ], 12, null);
    expect(out).toHaveLength(2);
    expect(out.every((e) => !e.isCluster)).toBe(true);
  });

  it('clusters nearby reports into a single entry', () => {
    const out = clusterReports([
      { latitude: 9.0, longitude: 38.7, title: 'A' },
      { latitude: 9.0, longitude: 38.7001, title: 'B' },
      { latitude: 9.1, longitude: 38.9, title: 'C' },
    ], 12, fakeMap);
    const clusters = out.filter((e) => e.isCluster);
    const singles = out.filter((e) => !e.isCluster);
    expect(singles).toHaveLength(1);
    expect(singles[0].reports[0].title).toBe('C');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reports).toHaveLength(2);
  });

  it('ignores reports without valid coordinates', () => {
    const out = clusterReports([
      { latitude: 9.0, longitude: 38.7 },
      { latitude: 'nope', longitude: 38.7 },
      { title: 'no coords' },
    ], 12, fakeMap);
    expect(out).toHaveLength(1);
  });
});

describe('computeReportStats', () => {
  const reports = [
    { subcity: 'Bole', woredaName: 'Woreda 1', category: 'road_issue', severityLevel: 'High' },
    { subcity: 'Bole', woredaName: 'Woreda 1', category: 'road_issue', severityLevel: 'High' },
    { subcity: 'Yeka', woredaName: 'Woreda 3', category: 'electricity_issue', severityLevel: 'Low' },
    { latitude: 9.02, longitude: 38.76 }, // no subcity → derived via subcityFor
  ];

  it('counts by subcity, woreda, category and level', () => {
    const stats = computeReportStats(reports, () => 'Arada');
    expect(stats.total).toBe(4);
    expect(stats.subcity[0]).toEqual({ key: 'Bole', count: 2 });
    expect(stats.woreda[0]).toEqual({ key: 'Woreda 1', count: 2 });
    expect(stats.category[0]).toEqual({ key: 'road_issue', count: 2 });
    expect(stats.level[0]).toEqual({ key: 'High', count: 2 });
  });

  it('uses the subcityFor callback when a report has no subcity', () => {
    const stats = computeReportStats(reports, () => 'Arada');
    expect(stats.subcity.some((s) => s.key === 'Arada' && s.count === 1)).toBe(true);
  });

  it('groups missing values under Unspecified', () => {
    const stats = computeReportStats([{ title: 'nothing' }]);
    expect(stats.category).toEqual([{ key: 'Unspecified', count: 1 }]);
  });

  it('handles empty input', () => {
    const stats = computeReportStats([]);
    expect(stats.total).toBe(0);
    expect(stats.subcity).toEqual([]);
  });
});

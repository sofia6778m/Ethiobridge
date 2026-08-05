import { describe, it, expect } from 'vitest';
import {
  pointInPolygon, detectSubcity, buildWoredaCells, woredaCellIndexFor,
  isInsideAddis, SUBCITIES, ADDIS_BOUNDS,
} from './addisAbabaGeo';

describe('pointInPolygon', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('returns true for a point inside the polygon', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });
});

describe('detectSubcity', () => {
  it('detects Bole near Bole International Airport', () => {
    const sc = detectSubcity(8.9839, 38.8009);
    expect(sc?.key).toBe('BOLE');
  });

  it('detects Yeka in the north-east', () => {
    const sc = detectSubcity(9.05, 38.85);
    expect(sc?.key).toBe('YEKA');
  });

  it('returns null for a point outside Addis Ababa', () => {
    expect(detectSubcity(12.0, 38.5)).toBeNull();
  });

  it('covers every subcity in the boundary', () => {
    expect(SUBCITIES.length).toBe(11);
    for (const sc of SUBCITIES) {
      expect(sc.woredaCount).toBeGreaterThan(0);
    }
  });
});

describe('woreda grid', () => {
  it('builds the expected number of cells for Bole', () => {
    const cells = buildWoredaCells('BOLE');
    expect(cells).toHaveLength(14);
    for (const c of cells) {
      expect(c.polygon.length).toBeGreaterThanOrEqual(4);
      expect(c.label).toMatch(/^Woreda \d+$/);
    }
  });

  it('finds the grid cell containing a Bole point', () => {
    const idx = woredaCellIndexFor(8.965, 38.815, 'BOLE');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(14);
  });

  it('returns -1 for unknown subcity', () => {
    expect(woredaCellIndexFor(8.965, 38.815, 'NOPE')).toBe(-1);
  });
});

describe('isInsideAddis', () => {
  it('accepts the city centre and rejects far away points', () => {
    expect(isInsideAddis(9.02, 38.76)).toBe(true);
    expect(isInsideAddis(8.9839, 38.8009)).toBe(true);
    expect(isInsideAddis(ADDIS_BOUNDS.north + 1, 38.76)).toBe(false);
  });
});

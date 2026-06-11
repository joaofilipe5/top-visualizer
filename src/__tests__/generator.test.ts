// ============================================================================
// TPP Visualizer — Instance Generator Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { generateInstance } from '../data/generator';
import { TINY_PRESET, SMALL_PRESET, MEDIUM_PRESET } from '../data/presets';
import type { InstanceGenerationConfig } from '../types';

describe('generateInstance', () => {
  it('generates the correct number of markets and products', () => {
    const instance = generateInstance(TINY_PRESET);
    expect(instance.markets).toHaveLength(TINY_PRESET.nMarkets);
    expect(instance.products).toHaveLength(TINY_PRESET.nProducts);
  });

  it('generates deterministic results with same seed', () => {
    const a = generateInstance(SMALL_PRESET);
    const b = generateInstance(SMALL_PRESET);
    expect(a.markets.length).toBe(b.markets.length);
    expect(a.products.length).toBe(b.products.length);
    // Same coordinates
    for (let i = 0; i < a.markets.length; i++) {
      expect(a.markets[i].x).toBeCloseTo(b.markets[i].x);
      expect(a.markets[i].y).toBeCloseTo(b.markets[i].y);
    }
  });

  it('generates different results with different seeds', () => {
    const configA = { ...SMALL_PRESET, seed: 42 };
    const configB = { ...SMALL_PRESET, seed: 99 };
    const a = generateInstance(configA);
    const b = generateInstance(configB);
    // Very unlikely to have same coordinates
    const sameCoords = a.markets.every(
      (m, i) => Math.abs(m.x - b.markets[i].x) < 0.001
    );
    expect(sameCoords).toBe(false);
  });

  it('ensures every product is available in at least one market (feasibility)', () => {
    const instance = generateInstance(SMALL_PRESET);
    for (const product of instance.products) {
      const available = instance.markets.some(
        (m) => m.prices[product.id] != null
      );
      expect(available).toBe(true);
    }
  });

  it('generates market IDs in expected format', () => {
    const instance = generateInstance(TINY_PRESET);
    instance.markets.forEach((m, i) => {
      expect(m.id).toBe(`m${i}`);
    });
  });

  it('generates product IDs in expected format', () => {
    const instance = generateInstance(TINY_PRESET);
    instance.products.forEach((p, i) => {
      expect(p.id).toBe(`p${i}`);
    });
  });

  it('respects depot coordinates', () => {
    const config = { ...SMALL_PRESET, depotX: 25, depotY: 75 };
    const instance = generateInstance(config);
    expect(instance.depot.x).toBe(25);
    expect(instance.depot.y).toBe(75);
  });

  it('generates with clustered spatial mode', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      spatialMode: 'clustered',
    };
    const instance = generateInstance(config);
    expect(instance.markets).toHaveLength(config.nMarkets);
  });

  it('generates with grid spatial mode', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      spatialMode: 'grid',
    };
    const instance = generateInstance(config);
    expect(instance.markets).toHaveLength(config.nMarkets);
  });

  it('generates with geoCorrelated price mode', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      priceMode: 'geoCorrelated',
    };
    const instance = generateInstance(config);
    // Check prices are within range
    for (const m of instance.markets) {
      for (const p of instance.products) {
        const price = m.prices[p.id];
        if (price != null) {
          expect(price).toBeGreaterThanOrEqual(config.minPrice * 0.5); // allow some margin
        }
      }
    }
  });

  it('generates with specialist price mode', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      priceMode: 'specialist',
    };
    const instance = generateInstance(config);
    expect(instance.markets).toHaveLength(config.nMarkets);
  });

  it('generates with warehouse price mode', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      priceMode: 'warehouse',
    };
    const instance = generateInstance(config);
    expect(instance.markets).toHaveLength(config.nMarkets);
  });

  it('generates random demand mode correctly', () => {
    const config: InstanceGenerationConfig = {
      ...SMALL_PRESET,
      demandMode: 'random',
      minDemand: 1,
      maxDemand: 5,
    };
    const instance = generateInstance(config);
    for (const p of instance.products) {
      expect(p.demand).toBeGreaterThanOrEqual(1);
      expect(p.demand).toBeLessThanOrEqual(5);
    }
  });

  it('includes metadata with statistics', () => {
    const instance = generateInstance(SMALL_PRESET);
    expect(instance.metadata).toBeDefined();
    expect(instance.metadata!.statistics).toBeDefined();
    expect(instance.metadata!.difficulty).toBeDefined();
    expect(['Easy', 'Medium', 'Hard', 'Very Hard']).toContain(
      instance.metadata!.difficulty
    );
  });

  it('can generate medium-sized instances', () => {
    const instance = generateInstance(MEDIUM_PRESET);
    expect(instance.markets).toHaveLength(50);
    expect(instance.products).toHaveLength(30);
  });
});

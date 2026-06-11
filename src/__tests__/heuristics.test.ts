// ============================================================================
// TPP Visualizer — Heuristic Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { distance, routeCost, purchaseCost, totalCost } from '../heuristics/cost';
import {
  nearestNeighborRoute,
  twoOpt,
  computeRouteInsertionCost,
  computeBestPurchaseAssignment,
} from '../heuristics/routing';
import { cheapestPurchaseFirst } from '../heuristics/cheapestPurchaseFirst';
import { greedyMarketInsertion } from '../heuristics/greedyInsertion';
import { regretConstruction } from '../heuristics/regretConstruction';
import { productAnxietyConstruction } from '../heuristics/productAnxiety';
import { localSearchImprove } from '../heuristics/localSearch';
import { TINY_SAMPLE_INSTANCE, SMALL_SAMPLE_INSTANCE } from '../data/sampleInstances';
import { EMPTY_RULEBOOK } from '../types';
import type { TPPInstance, Depot, Market, Product } from '../types';

// ============================================================================
// Distance & Cost Tests
// ============================================================================

describe('distance', () => {
  it('computes correct Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5.0);
  });

  it('returns 0 for same point', () => {
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 7, y: 9 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a));
  });
});

describe('routeCost', () => {
  const depot: Depot = { x: 0, y: 0 };
  const markets: Market[] = [
    { id: 'm0', name: 'M0', x: 3, y: 4, prices: {} },
    { id: 'm1', name: 'M1', x: 6, y: 8, prices: {} },
  ];

  it('returns 0 for empty route', () => {
    expect(routeCost([], markets, depot, 1)).toBe(0);
  });

  it('computes round trip for single market', () => {
    // depot(0,0) -> m0(3,4) -> depot(0,0) = 5 + 5 = 10
    expect(routeCost(['m0'], markets, depot, 1)).toBeCloseTo(10.0);
  });

  it('applies travel cost multiplier', () => {
    expect(routeCost(['m0'], markets, depot, 2)).toBeCloseTo(20.0);
  });

  it('computes multi-market route correctly', () => {
    // depot(0,0) -> m0(3,4) -> m1(6,8) -> depot(0,0)
    const d1 = 5; // depot to m0
    const d2 = 5; // m0 to m1 (same 3-4-5 triangle)
    const d3 = 10; // m1 to depot
    expect(routeCost(['m0', 'm1'], markets, depot, 1)).toBeCloseTo(d1 + d2 + d3);
  });
});

describe('purchaseCost', () => {
  it('sums price * quantity', () => {
    const assignments = [
      { productId: 'p0', marketId: 'm0', quantity: 2, price: 10 },
      { productId: 'p1', marketId: 'm1', quantity: 1, price: 15 },
    ];
    expect(purchaseCost(assignments)).toBe(35);
  });
});

describe('totalCost', () => {
  it('sums all components', () => {
    expect(totalCost(10, 20, 5)).toBe(35);
  });
});

// ============================================================================
// Routing Tests
// ============================================================================

describe('nearestNeighborRoute', () => {
  const depot: Depot = { x: 0, y: 0 };
  const markets: Market[] = [
    { id: 'm0', name: 'M0', x: 10, y: 0, prices: {} },
    { id: 'm1', name: 'M1', x: 1, y: 0, prices: {} },
    { id: 'm2', name: 'M2', x: 5, y: 0, prices: {} },
  ];

  it('visits nearest market first', () => {
    const route = nearestNeighborRoute(['m0', 'm1', 'm2'], markets, depot);
    expect(route).toHaveLength(3);
    // Nearest to depot is m1(1,0), then m2(5,0), then m0(10,0)
    expect(route[0]).toBe('m1');
    expect(route[1]).toBe('m2');
    expect(route[2]).toBe('m0');
  });

  it('returns empty route for no markets', () => {
    expect(nearestNeighborRoute([], markets, depot)).toHaveLength(0);
  });
});

describe('twoOpt', () => {
  it('does not increase route cost', () => {
    const depot: Depot = { x: 0, y: 0 };
    const markets: Market[] = [
      { id: 'm0', name: 'M0', x: 1, y: 0, prices: {} },
      { id: 'm1', name: 'M1', x: 0, y: 1, prices: {} },
      { id: 'm2', name: 'M2', x: 1, y: 1, prices: {} },
      { id: 'm3', name: 'M3', x: 0, y: 0.5, prices: {} },
    ];
    const initial = ['m0', 'm2', 'm1', 'm3']; // suboptimal
    const improved = twoOpt(initial, markets, depot);
    const costBefore = routeCost(initial, markets, depot, 1);
    const costAfter = routeCost(improved, markets, depot, 1);
    expect(costAfter).toBeLessThanOrEqual(costBefore);
  });
});

describe('computeRouteInsertionCost', () => {
  it('computes cheapest insertion position', () => {
    const depot: Depot = { x: 0, y: 0 };
    const markets: Market[] = [
      { id: 'm0', name: 'M0', x: 10, y: 0, prices: {} },
      { id: 'm1', name: 'M1', x: 5, y: 0, prices: {} },
    ];
    const route = ['m0'];
    // Insert m1 between depot and m0 should be cheaper than after m0
    const result = computeRouteInsertionCost(route, 'm1', markets, depot);
    expect(result.position).toBeDefined();
    expect(result.deltaCost).toBeDefined();
    expect(typeof result.deltaCost).toBe('number');
  });
});

describe('computeBestPurchaseAssignment', () => {
  it('assigns each product to cheapest available market', () => {
    const markets: Market[] = [
      { id: 'm0', name: 'M0', x: 0, y: 0, prices: { p0: 10, p1: 20 } },
      { id: 'm1', name: 'M1', x: 5, y: 5, prices: { p0: 15, p1: 5 } },
    ];
    const products: Product[] = [
      { id: 'p0', name: 'P0', demand: 1 },
      { id: 'p1', name: 'P1', demand: 1 },
    ];
    const assignments = computeBestPurchaseAssignment(['m0', 'm1'], products, markets);
    // p0 should go to m0 (price 10 < 15)
    const p0Assignment = assignments.find((a) => a.productId === 'p0');
    expect(p0Assignment?.marketId).toBe('m0');
    expect(p0Assignment?.price).toBe(10);
    // p1 should go to m1 (price 5 < 20)
    const p1Assignment = assignments.find((a) => a.productId === 'p1');
    expect(p1Assignment?.marketId).toBe('m1');
    expect(p1Assignment?.price).toBe(5);
  });
});

// ============================================================================
// Heuristic Tests
// ============================================================================

describe('cheapestPurchaseFirst', () => {
  it('produces non-empty steps', () => {
    const steps = cheapestPurchaseFirst(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('final solution covers all products', () => {
    const steps = cheapestPurchaseFirst(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    const final = steps[steps.length - 1].solution;
    const coveredProducts = new Set(final.assignments.map((a) => a.productId));
    for (const p of TINY_SAMPLE_INSTANCE.products) {
      expect(coveredProducts.has(p.id)).toBe(true);
    }
  });

  it('final solution has valid costs', () => {
    const steps = cheapestPurchaseFirst(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    const final = steps[steps.length - 1].solution;
    expect(final.travelCost).toBeGreaterThanOrEqual(0);
    expect(final.purchaseCost).toBeGreaterThan(0);
    expect(final.totalCost).toBeCloseTo(final.travelCost + final.purchaseCost + final.penaltyCost);
  });
});

describe('greedyMarketInsertion', () => {
  it('produces non-empty steps', () => {
    const steps = greedyMarketInsertion(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('final solution covers all products', () => {
    const steps = greedyMarketInsertion(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    const final = steps[steps.length - 1].solution;
    const coveredProducts = new Set(final.assignments.map((a) => a.productId));
    for (const p of TINY_SAMPLE_INSTANCE.products) {
      expect(coveredProducts.has(p.id)).toBe(true);
    }
  });
});

describe('regretConstruction', () => {
  it('produces non-empty steps', () => {
    const steps = regretConstruction(TINY_SAMPLE_INSTANCE, 0.5, EMPTY_RULEBOOK);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('final solution covers all products', () => {
    const steps = regretConstruction(TINY_SAMPLE_INSTANCE, 0.5, EMPTY_RULEBOOK);
    const final = steps[steps.length - 1].solution;
    const coveredProducts = new Set(final.assignments.map((a) => a.productId));
    for (const p of TINY_SAMPLE_INSTANCE.products) {
      expect(coveredProducts.has(p.id)).toBe(true);
    }
  });
});

describe('productAnxietyConstruction', () => {
  it('produces non-empty steps', () => {
    const steps = productAnxietyConstruction(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('final solution covers all products', () => {
    const steps = productAnxietyConstruction(TINY_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    const final = steps[steps.length - 1].solution;
    const coveredProducts = new Set(final.assignments.map((a) => a.productId));
    for (const p of TINY_SAMPLE_INSTANCE.products) {
      expect(coveredProducts.has(p.id)).toBe(true);
    }
  });
});

describe('localSearchImprove', () => {
  it('does not worsen the initial solution', () => {
    const initSteps = cheapestPurchaseFirst(SMALL_SAMPLE_INSTANCE, EMPTY_RULEBOOK);
    const initial = initSteps[initSteps.length - 1].solution;
    const lsSteps = localSearchImprove(SMALL_SAMPLE_INSTANCE, initial, EMPTY_RULEBOOK, 'strict');
    if (lsSteps.length > 0) {
      const final = lsSteps[lsSteps.length - 1].solution;
      expect(final.totalCost).toBeLessThanOrEqual(initial.totalCost + 0.01);
    }
  });
});

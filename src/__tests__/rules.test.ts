// ============================================================================
// TPP Visualizer — Rule Validation Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { validateSolution, isFeasible, computePenaltyCostFromViolations } from '../rules/validation';
import type { TPPInstance, Solution, Rulebook, IncompatibilityRule } from '../types';
import { EMPTY_RULEBOOK } from '../types';

// --- Test fixtures ---

const testInstance: TPPInstance = {
  depot: { x: 0, y: 0 },
  markets: [
    { id: 'm0', name: 'Market 0', x: 10, y: 0, prices: { p0: 10, p1: 20 } },
    { id: 'm1', name: 'Market 1', x: 0, y: 10, prices: { p0: 15, p1: 5 } },
    { id: 'm2', name: 'Market 2', x: 10, y: 10, prices: { p0: 12, p1: null } },
  ],
  products: [
    { id: 'p0', name: 'Product 0', demand: 1 },
    { id: 'p1', name: 'Product 1', demand: 1 },
  ],
  travelCostMultiplier: 1,
};

const baseSolution: Solution = {
  route: ['m0', 'm1'],
  selectedMarkets: ['m0', 'm1'],
  assignments: [
    { productId: 'p0', marketId: 'm0', quantity: 1, price: 10 },
    { productId: 'p1', marketId: 'm1', quantity: 1, price: 5 },
  ],
  travelCost: 30,
  purchaseCost: 15,
  penaltyCost: 0,
  totalCost: 45,
  feasible: true,
  violations: [],
};

function makeRulebook(rules: IncompatibilityRule[]): Rulebook {
  return { id: 'test', name: 'Test', description: 'Test rulebook', rules };
}

function makeRule(partial: Partial<IncompatibilityRule>): IncompatibilityRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    description: 'Test',
    severity: 'hard',
    scope: 'solution',
    type: 'budget_limit',
    enabled: true,
    ...partial,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('validateSolution with empty rulebook', () => {
  it('returns no violations', () => {
    const violations = validateSolution(testInstance, baseSolution, EMPTY_RULEBOOK);
    expect(violations).toHaveLength(0);
  });
});

describe('budget_limit rule', () => {
  it('detects violation when cost exceeds budget', () => {
    const rule = makeRule({ type: 'budget_limit', value: 10, scope: 'solution' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('rule-1');
  });

  it('passes when cost is under budget', () => {
    const rule = makeRule({ type: 'budget_limit', value: 1000, scope: 'solution' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations).toHaveLength(0);
  });
});

describe('max_markets rule', () => {
  it('detects violation when too many markets', () => {
    const rule = makeRule({ type: 'max_markets', value: 1, scope: 'solution' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('min_markets rule', () => {
  it('detects violation when too few markets', () => {
    const rule = makeRule({ type: 'min_markets', value: 5, scope: 'solution' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('must_visit_market rule', () => {
  it('detects violation when required market not visited', () => {
    const rule = makeRule({ type: 'must_visit_market', marketIds: ['m2'], scope: 'market' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('passes when required market is visited', () => {
    const rule = makeRule({ type: 'must_visit_market', marketIds: ['m0'], scope: 'market' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations).toHaveLength(0);
  });
});

describe('forbidden_market rule', () => {
  it('detects violation when forbidden market is visited', () => {
    const rule = makeRule({ type: 'forbidden_market', marketIds: ['m0'], scope: 'market' });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('markets_cannot_both_be_visited rule', () => {
  it('detects when both exclusive markets visited', () => {
    const rule = makeRule({
      type: 'markets_cannot_both_be_visited',
      marketIds: ['m0', 'm1'],
      scope: 'market',
    });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('products_cannot_be_bought_together rule', () => {
  it('detects when incompatible products are both purchased', () => {
    const rule = makeRule({
      type: 'products_cannot_be_bought_together',
      productIds: ['p0', 'p1'],
      scope: 'product',
    });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('forbidden_purchase_assignment rule', () => {
  it('detects when forbidden assignment exists', () => {
    const rule = makeRule({
      type: 'forbidden_purchase_assignment',
      productIds: ['p0'],
      marketIds: ['m0'],
      scope: 'purchase',
    });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('disabled rules', () => {
  it('ignores disabled rules', () => {
    const rule = makeRule({ type: 'budget_limit', value: 1, enabled: false });
    const rulebook = makeRulebook([rule]);
    const violations = validateSolution(testInstance, baseSolution, rulebook);
    expect(violations).toHaveLength(0);
  });
});

describe('isFeasible', () => {
  it('returns true with no violations', () => {
    expect(isFeasible(testInstance, baseSolution, EMPTY_RULEBOOK)).toBe(true);
  });

  it('returns false with hard violation', () => {
    const rule = makeRule({ type: 'budget_limit', value: 1, severity: 'hard' });
    const rulebook = makeRulebook([rule]);
    expect(isFeasible(testInstance, baseSolution, rulebook)).toBe(false);
  });

  it('returns true with only soft violations', () => {
    const rule = makeRule({
      type: 'budget_limit',
      value: 1,
      severity: 'soft',
      penalty: 100,
    });
    const rulebook = makeRulebook([rule]);
    expect(isFeasible(testInstance, baseSolution, rulebook)).toBe(true);
  });
});

describe('computePenaltyCostFromViolations', () => {
  it('sums penalties correctly', () => {
    const violations = [
      { ruleId: '1', ruleName: 'A', severity: 'soft' as const, message: '', penalty: 50, affectedProducts: [], affectedMarkets: [], affectedEdges: [] },
      { ruleId: '2', ruleName: 'B', severity: 'soft' as const, message: '', penalty: 75, affectedProducts: [], affectedMarkets: [], affectedEdges: [] },
    ];
    expect(computePenaltyCostFromViolations(violations)).toBe(125);
  });

  it('returns 0 for empty violations', () => {
    expect(computePenaltyCostFromViolations([])).toBe(0);
  });
});

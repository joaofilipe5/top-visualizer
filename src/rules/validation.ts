// ============================================================================
// TPP Rule Validation Engine
// ============================================================================
// Extensible validator registry: one function per RuleType, keyed in a map.
// New rule types can be added by simply registering another entry.
// ============================================================================

import {
  TPPInstance,
  Solution,
  Rulebook,
  IncompatibilityRule,
  RuleViolation,
  RuleType,
} from '../types';

// ---------------------------------------------------------------------------
// Euclidean distance helper
// ---------------------------------------------------------------------------

function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ---------------------------------------------------------------------------
// Validator Function Signature
// ---------------------------------------------------------------------------

type ValidatorFn = (
  rule: IncompatibilityRule,
  instance: TPPInstance,
  solution: Solution
) => RuleViolation | null;

// ---------------------------------------------------------------------------
// Helper to build a violation object
// ---------------------------------------------------------------------------

function makeViolation(
  rule: IncompatibilityRule,
  message: string,
  affectedProducts: string[] = [],
  affectedMarkets: string[] = [],
  affectedEdges: Array<{ fromMarketId: string; toMarketId: string }> = []
): RuleViolation {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    message,
    penalty: rule.severity === 'soft' ? (rule.penalty ?? 0) : 0,
    affectedProducts,
    affectedMarkets,
    affectedEdges,
  };
}

// ---------------------------------------------------------------------------
// 1. products_cannot_be_bought_together
// If ALL products in productIds are purchased, the rule is violated.
// ---------------------------------------------------------------------------
const validateProductsCannotBeBoughtTogether: ValidatorFn = (rule, _instance, solution) => {
  const ids = rule.productIds ?? [];
  if (ids.length < 2) return null;

  const purchasedIds = new Set(solution.assignments.map((a) => a.productId));
  const allPurchased = ids.every((pid) => purchasedIds.has(pid));

  if (allPurchased) {
    return makeViolation(
      rule,
      `Products [${ids.join(', ')}] cannot all be purchased together.`,
      ids
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 2. products_cannot_share_market
// No pair of the listed products may be assigned to the same market.
// ---------------------------------------------------------------------------
const validateProductsCannotShareMarket: ValidatorFn = (rule, _instance, solution) => {
  const ids = rule.productIds ?? [];
  if (ids.length < 2) return null;

  // Build map: productId → marketId
  const productMarket: Record<string, string> = {};
  for (const a of solution.assignments) {
    if (ids.includes(a.productId)) {
      productMarket[a.productId] = a.marketId;
    }
  }

  // Check all pairs
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const mA = productMarket[ids[i]];
      const mB = productMarket[ids[j]];
      if (mA && mB && mA === mB) {
        return makeViolation(
          rule,
          `Products ${ids[i]} and ${ids[j]} cannot be assigned to the same market (${mA}).`,
          [ids[i], ids[j]],
          [mA]
        );
      }
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// 3. markets_cannot_both_be_visited
// If ALL markets in marketIds are in selectedMarkets, the rule is violated.
// ---------------------------------------------------------------------------
const validateMarketsCannotBothBeVisited: ValidatorFn = (rule, _instance, solution) => {
  const ids = rule.marketIds ?? [];
  if (ids.length < 2) return null;

  const selectedSet = new Set(solution.selectedMarkets);
  const allVisited = ids.every((mid) => selectedSet.has(mid));

  if (allVisited) {
    return makeViolation(
      rule,
      `Markets [${ids.join(', ')}] cannot all be visited.`,
      [],
      ids
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 4. market_requires_product
// If the market is visited, the product must be purchased.
// ---------------------------------------------------------------------------
const validateMarketRequiresProduct: ValidatorFn = (rule, _instance, solution) => {
  const marketId = rule.marketIds?.[0];
  const productId = rule.productIds?.[0];
  if (!marketId || !productId) return null;

  const marketVisited = solution.selectedMarkets.includes(marketId);
  if (!marketVisited) return null;

  const productPurchased = solution.assignments.some((a) => a.productId === productId);
  if (!productPurchased) {
    return makeViolation(
      rule,
      `Market ${marketId} is visited, so product ${productId} must be purchased.`,
      [productId],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 5. product_requires_product
// If productA is purchased, productB must also be purchased.
// productIds[0] = A, productIds[1] = B
// ---------------------------------------------------------------------------
const validateProductRequiresProduct: ValidatorFn = (rule, _instance, solution) => {
  const ids = rule.productIds ?? [];
  if (ids.length < 2) return null;

  const purchasedIds = new Set(solution.assignments.map((a) => a.productId));
  if (purchasedIds.has(ids[0]) && !purchasedIds.has(ids[1])) {
    return makeViolation(
      rule,
      `Product ${ids[0]} is purchased, so product ${ids[1]} must also be purchased.`,
      [ids[0], ids[1]]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 6. product_requires_market
// If the product is purchased, the market must be visited.
// ---------------------------------------------------------------------------
const validateProductRequiresMarket: ValidatorFn = (rule, _instance, solution) => {
  const productId = rule.productIds?.[0];
  const marketId = rule.marketIds?.[0];
  if (!productId || !marketId) return null;

  const productPurchased = solution.assignments.some((a) => a.productId === productId);
  if (!productPurchased) return null;

  const marketVisited = solution.selectedMarkets.includes(marketId);
  if (!marketVisited) {
    return makeViolation(
      rule,
      `Product ${productId} is purchased, so market ${marketId} must be visited.`,
      [productId],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 7. market_forbids_product
// If the market is visited, the product cannot be purchased there.
// ---------------------------------------------------------------------------
const validateMarketForbidsProduct: ValidatorFn = (rule, _instance, solution) => {
  const marketId = rule.marketIds?.[0];
  const productId = rule.productIds?.[0];
  if (!marketId || !productId) return null;

  const marketVisited = solution.selectedMarkets.includes(marketId);
  if (!marketVisited) return null;

  const purchasedAtMarket = solution.assignments.some(
    (a) => a.productId === productId && a.marketId === marketId
  );
  if (purchasedAtMarket) {
    return makeViolation(
      rule,
      `Product ${productId} cannot be purchased at market ${marketId}.`,
      [productId],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 8. route_forbidden_edge
// The route cannot contain the edge from→to (consecutive in route).
// ---------------------------------------------------------------------------
const validateRouteForbiddenEdge: ValidatorFn = (rule, _instance, solution) => {
  const edge = rule.edge;
  if (!edge) return null;

  const route = solution.route;
  for (let i = 0; i < route.length - 1; i++) {
    if (route[i] === edge.fromMarketId && route[i + 1] === edge.toMarketId) {
      return makeViolation(
        rule,
        `Route contains forbidden edge ${edge.fromMarketId} → ${edge.toMarketId}.`,
        [],
        [edge.fromMarketId, edge.toMarketId],
        [{ fromMarketId: edge.fromMarketId, toMarketId: edge.toMarketId }]
      );
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// 9. route_requires_edge
// The route must contain the edge from→to (consecutive in route).
// ---------------------------------------------------------------------------
const validateRouteRequiresEdge: ValidatorFn = (rule, _instance, solution) => {
  const edge = rule.edge;
  if (!edge) return null;

  const route = solution.route;
  // Only check if both markets are in the route
  if (
    !route.includes(edge.fromMarketId) ||
    !route.includes(edge.toMarketId)
  ) {
    return makeViolation(
      rule,
      `Route must contain edge ${edge.fromMarketId} → ${edge.toMarketId}, but one or both markets are not in the route.`,
      [],
      [edge.fromMarketId, edge.toMarketId],
      [{ fromMarketId: edge.fromMarketId, toMarketId: edge.toMarketId }]
    );
  }

  for (let i = 0; i < route.length - 1; i++) {
    if (route[i] === edge.fromMarketId && route[i + 1] === edge.toMarketId) {
      return null; // found the required edge
    }
  }

  return makeViolation(
    rule,
    `Route must contain edge ${edge.fromMarketId} → ${edge.toMarketId} as consecutive stops.`,
    [],
    [edge.fromMarketId, edge.toMarketId],
    [{ fromMarketId: edge.fromMarketId, toMarketId: edge.toMarketId }]
  );
};

// ---------------------------------------------------------------------------
// 10. route_max_distance_between_markets
// No leg in the route can exceed `value` distance.
// Also checks depot→first and last→depot legs.
// ---------------------------------------------------------------------------
const validateRouteMaxDistanceBetweenMarkets: ValidatorFn = (rule, instance, solution) => {
  const maxDist = rule.value;
  if (maxDist === undefined || maxDist === null) return null;

  const route = solution.route;
  if (route.length === 0) return null;

  const marketMap = new Map(instance.markets.map((m) => [m.id, m]));
  const depot = instance.depot;

  // Build list of legs: depot → m0, m0→m1, ..., mN→depot
  const legs: Array<{ from: string; to: string; dist: number }> = [];

  const first = marketMap.get(route[0]);
  if (first) {
    const d = euclidean(depot.x, depot.y, first.x, first.y);
    legs.push({ from: 'depot', to: route[0], dist: d });
  }

  for (let i = 0; i < route.length - 1; i++) {
    const a = marketMap.get(route[i]);
    const b = marketMap.get(route[i + 1]);
    if (a && b) {
      legs.push({ from: route[i], to: route[i + 1], dist: euclidean(a.x, a.y, b.x, b.y) });
    }
  }

  const last = marketMap.get(route[route.length - 1]);
  if (last) {
    legs.push({
      from: route[route.length - 1],
      to: 'depot',
      dist: euclidean(last.x, last.y, depot.x, depot.y),
    });
  }

  for (const leg of legs) {
    if (leg.dist > maxDist) {
      return makeViolation(
        rule,
        `Route leg ${leg.from} → ${leg.to} has distance ${leg.dist.toFixed(2)} which exceeds max ${maxDist}.`,
        [],
        [leg.from, leg.to].filter((id) => id !== 'depot'),
        [{ fromMarketId: leg.from, toMarketId: leg.to }]
      );
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// 11. route_precedence
// Market A must appear before market B in the route.
// ---------------------------------------------------------------------------
const validateRoutePrecedence: ValidatorFn = (rule, _instance, solution) => {
  const pair = rule.orderedPair;
  if (!pair) return null;

  const route = solution.route;
  const idxA = route.indexOf(pair.beforeMarketId);
  const idxB = route.indexOf(pair.afterMarketId);

  // Only enforce if both are in the route
  if (idxA === -1 || idxB === -1) return null;

  if (idxA >= idxB) {
    return makeViolation(
      rule,
      `Market ${pair.beforeMarketId} must appear before ${pair.afterMarketId} in the route.`,
      [],
      [pair.beforeMarketId, pair.afterMarketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 12. budget_limit
// Total cost must not exceed rule.value.
// ---------------------------------------------------------------------------
const validateBudgetLimit: ValidatorFn = (rule, _instance, solution) => {
  const budget = rule.value;
  if (budget === undefined || budget === null) return null;

  if (solution.totalCost > budget) {
    return makeViolation(
      rule,
      `Total cost ${solution.totalCost.toFixed(2)} exceeds budget limit ${budget}.`
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 13. max_markets
// selectedMarkets.length must not exceed rule.value.
// ---------------------------------------------------------------------------
const validateMaxMarkets: ValidatorFn = (rule, _instance, solution) => {
  const maxVal = rule.value;
  if (maxVal === undefined || maxVal === null) return null;

  if (solution.selectedMarkets.length > maxVal) {
    return makeViolation(
      rule,
      `Visiting ${solution.selectedMarkets.length} markets exceeds the maximum of ${maxVal}.`,
      [],
      solution.selectedMarkets
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 14. min_markets
// selectedMarkets.length must be at least rule.value.
// ---------------------------------------------------------------------------
const validateMinMarkets: ValidatorFn = (rule, _instance, solution) => {
  const minVal = rule.value;
  if (minVal === undefined || minVal === null) return null;

  if (solution.selectedMarkets.length < minVal) {
    return makeViolation(
      rule,
      `Visiting ${solution.selectedMarkets.length} markets is below the minimum of ${minVal}.`,
      [],
      solution.selectedMarkets
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 15. must_visit_market
// marketIds[0] must be in selectedMarkets.
// ---------------------------------------------------------------------------
const validateMustVisitMarket: ValidatorFn = (rule, _instance, solution) => {
  const marketId = rule.marketIds?.[0];
  if (!marketId) return null;

  if (!solution.selectedMarkets.includes(marketId)) {
    return makeViolation(
      rule,
      `Market ${marketId} must be visited.`,
      [],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 16. forbidden_market
// marketIds[0] cannot be in selectedMarkets.
// ---------------------------------------------------------------------------
const validateForbiddenMarket: ValidatorFn = (rule, _instance, solution) => {
  const marketId = rule.marketIds?.[0];
  if (!marketId) return null;

  if (solution.selectedMarkets.includes(marketId)) {
    return makeViolation(
      rule,
      `Market ${marketId} is forbidden and cannot be visited.`,
      [],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 17. must_buy_product_at_market
// productIds[0] must be assigned to marketIds[0].
// ---------------------------------------------------------------------------
const validateMustBuyProductAtMarket: ValidatorFn = (rule, _instance, solution) => {
  const productId = rule.productIds?.[0];
  const marketId = rule.marketIds?.[0];
  if (!productId || !marketId) return null;

  const found = solution.assignments.some(
    (a) => a.productId === productId && a.marketId === marketId
  );
  if (!found) {
    return makeViolation(
      rule,
      `Product ${productId} must be purchased at market ${marketId}.`,
      [productId],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// 18. forbidden_purchase_assignment
// productIds[0] cannot be assigned to marketIds[0].
// ---------------------------------------------------------------------------
const validateForbiddenPurchaseAssignment: ValidatorFn = (rule, _instance, solution) => {
  const productId = rule.productIds?.[0];
  const marketId = rule.marketIds?.[0];
  if (!productId || !marketId) return null;

  const found = solution.assignments.some(
    (a) => a.productId === productId && a.marketId === marketId
  );
  if (found) {
    return makeViolation(
      rule,
      `Product ${productId} cannot be purchased at market ${marketId}.`,
      [productId],
      [marketId]
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Validator Registry
// ---------------------------------------------------------------------------

const VALIDATOR_REGISTRY: Record<RuleType, ValidatorFn> = {
  products_cannot_be_bought_together: validateProductsCannotBeBoughtTogether,
  products_cannot_share_market: validateProductsCannotShareMarket,
  markets_cannot_both_be_visited: validateMarketsCannotBothBeVisited,
  market_requires_product: validateMarketRequiresProduct,
  product_requires_product: validateProductRequiresProduct,
  product_requires_market: validateProductRequiresMarket,
  market_forbids_product: validateMarketForbidsProduct,
  route_forbidden_edge: validateRouteForbiddenEdge,
  route_requires_edge: validateRouteRequiresEdge,
  route_max_distance_between_markets: validateRouteMaxDistanceBetweenMarkets,
  route_precedence: validateRoutePrecedence,
  budget_limit: validateBudgetLimit,
  max_markets: validateMaxMarkets,
  min_markets: validateMinMarkets,
  must_visit_market: validateMustVisitMarket,
  forbidden_market: validateForbiddenMarket,
  must_buy_product_at_market: validateMustBuyProductAtMarket,
  forbidden_purchase_assignment: validateForbiddenPurchaseAssignment,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a solution against all enabled rules in a rulebook.
 * Returns an array of violations (empty = no violations).
 */
export function validateSolution(
  instance: TPPInstance,
  solution: Solution,
  rulebook: Rulebook
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rulebook.rules) {
    if (!rule.enabled) continue;

    const validator = VALIDATOR_REGISTRY[rule.type];
    if (!validator) {
      // Unknown rule type — skip silently (extensibility point)
      continue;
    }

    const violation = validator(rule, instance, solution);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Check whether a solution is feasible (no hard-constraint violations).
 */
export function isFeasible(
  instance: TPPInstance,
  solution: Solution,
  rulebook: Rulebook
): boolean {
  const violations = validateSolution(instance, solution, rulebook);
  return violations.every((v) => v.severity !== 'hard');
}

/**
 * Sum up the penalty costs from all violations.
 * Hard violations have penalty = 0 by convention (they render the solution
 * infeasible rather than penalised).
 */
export function computePenaltyCostFromViolations(violations: RuleViolation[]): number {
  return violations.reduce((sum, v) => sum + v.penalty, 0);
}

/**
 * Recompute a solution's costs including rule-based penalties and feasibility.
 * Returns a new Solution object with updated penaltyCost, totalCost,
 * feasible flag, and violations list.
 */
export function computeTotalCostWithRules(
  instance: TPPInstance,
  solution: Solution,
  rulebook: Rulebook
): Solution {
  const violations = validateSolution(instance, solution, rulebook);
  const penaltyCost = computePenaltyCostFromViolations(violations);
  const feasible = violations.every((v) => v.severity !== 'hard');

  return {
    ...solution,
    penaltyCost,
    totalCost: solution.travelCost + solution.purchaseCost + penaltyCost,
    feasible,
    violations,
  };
}

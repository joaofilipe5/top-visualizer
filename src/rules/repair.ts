// ============================================================================
// TPP Solution Repair Operators
// ============================================================================
// Iteratively applies repair operators to fix rule violations in a solution.
// Each operator targets a specific violation type and modifies the solution
// to resolve it, producing HeuristicStep records for the visualizer.
// ============================================================================

import {
  TPPInstance,
  Solution,
  Rulebook,
  RuleViolation,
  HeuristicStep,
  PurchaseAssignment,
  IncompatibilityRule,
} from '../types';
import { validateSolution } from './validation';

// ---------------------------------------------------------------------------
// Euclidean distance helper
// ---------------------------------------------------------------------------

function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ---------------------------------------------------------------------------
// Compute travel cost for a route
// ---------------------------------------------------------------------------

function computeTravelCost(
  route: string[],
  instance: TPPInstance
): number {
  if (route.length === 0) return 0;

  const marketMap = new Map(instance.markets.map((m) => [m.id, m]));
  const depot = instance.depot;
  let cost = 0;

  // Depot → first market
  const first = marketMap.get(route[0]);
  if (first) cost += euclidean(depot.x, depot.y, first.x, first.y);

  // Market-to-market
  for (let i = 0; i < route.length - 1; i++) {
    const a = marketMap.get(route[i]);
    const b = marketMap.get(route[i + 1]);
    if (a && b) cost += euclidean(a.x, a.y, b.x, b.y);
  }

  // Last market → depot
  const last = marketMap.get(route[route.length - 1]);
  if (last) cost += euclidean(last.x, last.y, depot.x, depot.y);

  return cost * instance.travelCostMultiplier;
}

// ---------------------------------------------------------------------------
// Compute purchase cost from assignments
// ---------------------------------------------------------------------------

function computePurchaseCost(assignments: PurchaseAssignment[]): number {
  return assignments.reduce((sum, a) => sum + a.price * a.quantity, 0);
}

// ---------------------------------------------------------------------------
// Rebuild solution costs
// ---------------------------------------------------------------------------

function rebuildSolution(
  route: string[],
  assignments: PurchaseAssignment[],
  instance: TPPInstance,
  rulebook: Rulebook
): Solution {
  const selectedMarkets = [...new Set(route)];
  const travelCost = computeTravelCost(route, instance);
  const purchaseCost = computePurchaseCost(assignments);
  const violations = validateSolution(
    instance,
    {
      route,
      selectedMarkets,
      assignments,
      travelCost,
      purchaseCost,
      penaltyCost: 0,
      totalCost: travelCost + purchaseCost,
      feasible: true,
      violations: [],
    },
    rulebook
  );
  const penaltyCost = violations
    .filter((v) => v.severity === 'soft')
    .reduce((sum, v) => sum + v.penalty, 0);

  return {
    route,
    selectedMarkets,
    assignments,
    travelCost: Math.round(travelCost * 100) / 100,
    purchaseCost: Math.round(purchaseCost * 100) / 100,
    penaltyCost: Math.round(penaltyCost * 100) / 100,
    totalCost: Math.round((travelCost + purchaseCost + penaltyCost) * 100) / 100,
    feasible: violations.every((v) => v.severity !== 'hard'),
    violations,
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Remove Forbidden Market
// ---------------------------------------------------------------------------

function removeForbiddenMarket(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  const forbiddenMarket = violation.affectedMarkets[0];
  if (!forbiddenMarket) return null;

  // Remove market from route
  const newRoute = solution.route.filter((mid) => mid !== forbiddenMarket);

  // Reassign products that were purchased at the forbidden market
  const reassigned: PurchaseAssignment[] = [];
  const remaining: PurchaseAssignment[] = [];

  for (const a of solution.assignments) {
    if (a.marketId === forbiddenMarket) {
      // Find cheapest alternative market for this product
      const alt = findCheapestAlternative(a.productId, forbiddenMarket, instance, newRoute);
      if (alt) {
        reassigned.push(alt);
        // Ensure the new market is in the route
        if (!newRoute.includes(alt.marketId)) {
          newRoute.push(alt.marketId);
        }
      }
      // If no alternative found, the product is dropped (infeasible, but best effort)
    } else {
      remaining.push(a);
    }
  }

  const newAssignments = [...remaining, ...reassigned];
  const newSolution = rebuildSolution(newRoute, newAssignments, instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'removeForbiddenMarket',
      explanation: `Removed forbidden market ${forbiddenMarket} and reassigned ${reassigned.length} product(s).`,
      solution: newSolution,
      highlightedMarkets: [forbiddenMarket],
      highlightedProducts: reassigned.map((a) => a.productId),
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Add Must-Visit Market
// ---------------------------------------------------------------------------

function addMustVisitMarket(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  const requiredMarket = violation.affectedMarkets[0];
  if (!requiredMarket) return null;

  const newRoute = [...solution.route];
  if (!newRoute.includes(requiredMarket)) {
    // Insert at the best position (cheapest insertion)
    const bestPos = findBestInsertionPosition(requiredMarket, newRoute, instance);
    newRoute.splice(bestPos, 0, requiredMarket);
  }

  const newSolution = rebuildSolution(newRoute, [...solution.assignments], instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'addMustVisitMarket',
      explanation: `Added required market ${requiredMarket} to the route.`,
      solution: newSolution,
      highlightedMarkets: [requiredMarket],
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Reassign Forbidden Purchase
// ---------------------------------------------------------------------------

function reassignForbiddenPurchase(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  const productId = violation.affectedProducts[0];
  const forbiddenMarket = violation.affectedMarkets[0];
  if (!productId || !forbiddenMarket) return null;

  const newRoute = [...solution.route];
  const newAssignments = solution.assignments.filter(
    (a) => !(a.productId === productId && a.marketId === forbiddenMarket)
  );

  // Find cheapest alternative
  const alt = findCheapestAlternative(productId, forbiddenMarket, instance, newRoute);
  if (alt) {
    newAssignments.push(alt);
    if (!newRoute.includes(alt.marketId)) {
      const pos = findBestInsertionPosition(alt.marketId, newRoute, instance);
      newRoute.splice(pos, 0, alt.marketId);
    }
  }

  const newSolution = rebuildSolution(newRoute, newAssignments, instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'reassignForbiddenPurchase',
      explanation: `Reassigned product ${productId} away from forbidden market ${forbiddenMarket}${alt ? ` to ${alt.marketId}` : ' (no alternative found)'}.`,
      solution: newSolution,
      highlightedMarkets: [forbiddenMarket, ...(alt ? [alt.marketId] : [])],
      highlightedProducts: [productId],
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Separate Incompatible Products
// ---------------------------------------------------------------------------

function separateIncompatibleProducts(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  // The violation indicates two products sharing a market that shouldn't
  const products = violation.affectedProducts;
  const sharedMarket = violation.affectedMarkets[0];
  if (products.length < 2 || !sharedMarket) return null;

  // Move the second product to its cheapest alternative market
  const productToMove = products[1];
  const newRoute = [...solution.route];
  const newAssignments = solution.assignments.filter(
    (a) => !(a.productId === productToMove && a.marketId === sharedMarket)
  );

  const alt = findCheapestAlternative(productToMove, sharedMarket, instance, newRoute);
  if (alt) {
    newAssignments.push(alt);
    if (!newRoute.includes(alt.marketId)) {
      const pos = findBestInsertionPosition(alt.marketId, newRoute, instance);
      newRoute.splice(pos, 0, alt.marketId);
    }
  }

  const newSolution = rebuildSolution(newRoute, newAssignments, instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'separateIncompatibleProducts',
      explanation: `Moved product ${productToMove} away from market ${sharedMarket} to separate incompatible products.`,
      solution: newSolution,
      highlightedMarkets: [sharedMarket, ...(alt ? [alt.marketId] : [])],
      highlightedProducts: products,
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Fix Forbidden Edge
// ---------------------------------------------------------------------------

function fixForbiddenEdge(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  const edge = violation.affectedEdges[0];
  if (!edge) return null;

  const newRoute = [...solution.route];

  // Find the position of the forbidden edge
  for (let i = 0; i < newRoute.length - 1; i++) {
    if (newRoute[i] === edge.fromMarketId && newRoute[i + 1] === edge.toMarketId) {
      // Swap the two markets to break the edge
      // This is a simple reinsertion: remove the 'to' market and insert it elsewhere
      const removed = newRoute.splice(i + 1, 1)[0];
      // Try inserting it at the position that minimizes cost
      let bestPos = 0;
      let bestCost = Infinity;
      for (let j = 0; j <= newRoute.length; j++) {
        // Skip the position that would recreate the forbidden edge
        if (j > 0 && newRoute[j - 1] === edge.fromMarketId) continue;
        if (j < newRoute.length && newRoute[j] === edge.fromMarketId) continue;

        const testRoute = [...newRoute.slice(0, j), removed, ...newRoute.slice(j)];
        const cost = computeTravelCost(testRoute, instance);
        if (cost < bestCost) {
          bestCost = cost;
          bestPos = j;
        }
      }
      newRoute.splice(bestPos, 0, removed);
      break;
    }
  }

  const newSolution = rebuildSolution(newRoute, [...solution.assignments], instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'fixForbiddenEdge',
      explanation: `Reordered route to remove forbidden edge ${edge.fromMarketId} → ${edge.toMarketId}.`,
      solution: newSolution,
      highlightedMarkets: [edge.fromMarketId, edge.toMarketId],
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Add Required Edge
// ---------------------------------------------------------------------------

function addRequiredEdge(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  const edge = violation.affectedEdges[0];
  if (!edge) return null;

  let newRoute = [...solution.route];

  // Ensure both markets are in the route
  if (!newRoute.includes(edge.fromMarketId)) {
    const pos = findBestInsertionPosition(edge.fromMarketId, newRoute, instance);
    newRoute.splice(pos, 0, edge.fromMarketId);
  }
  if (!newRoute.includes(edge.toMarketId)) {
    const pos = findBestInsertionPosition(edge.toMarketId, newRoute, instance);
    newRoute.splice(pos, 0, edge.toMarketId);
  }

  // Now reorder so that from is immediately before to
  // Remove both, then insert them consecutively at the best position
  newRoute = newRoute.filter(
    (mid) => mid !== edge.fromMarketId && mid !== edge.toMarketId
  );

  let bestPos = 0;
  let bestCost = Infinity;
  for (let j = 0; j <= newRoute.length; j++) {
    const testRoute = [
      ...newRoute.slice(0, j),
      edge.fromMarketId,
      edge.toMarketId,
      ...newRoute.slice(j),
    ];
    const cost = computeTravelCost(testRoute, instance);
    if (cost < bestCost) {
      bestCost = cost;
      bestPos = j;
    }
  }
  newRoute.splice(bestPos, 0, edge.fromMarketId, edge.toMarketId);

  const newSolution = rebuildSolution(newRoute, [...solution.assignments], instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'addRequiredEdge',
      explanation: `Reordered route to include required edge ${edge.fromMarketId} → ${edge.toMarketId}.`,
      solution: newSolution,
      highlightedMarkets: [edge.fromMarketId, edge.toMarketId],
    },
  };
}

// ---------------------------------------------------------------------------
// Repair Operator: Fix Precedence
// ---------------------------------------------------------------------------

function fixPrecedence(
  solution: Solution,
  violation: RuleViolation,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number,
  rule: IncompatibilityRule
): { solution: Solution; step: HeuristicStep } | null {
  const pair = rule.orderedPair;
  if (!pair) return null;

  const newRoute = [...solution.route];
  const idxA = newRoute.indexOf(pair.beforeMarketId);
  const idxB = newRoute.indexOf(pair.afterMarketId);

  if (idxA === -1 || idxB === -1) return null;
  if (idxA < idxB) return null; // already correct

  // Remove B and insert it after A
  newRoute.splice(idxB, 1);
  const newIdxA = newRoute.indexOf(pair.beforeMarketId);
  newRoute.splice(newIdxA + 1, 0, pair.afterMarketId);

  const newSolution = rebuildSolution(newRoute, [...solution.assignments], instance, rulebook);

  return {
    solution: newSolution,
    step: {
      stepNumber: stepNum,
      action: 'fixPrecedence',
      explanation: `Moved ${pair.afterMarketId} after ${pair.beforeMarketId} to satisfy precedence constraint.`,
      solution: newSolution,
      highlightedMarkets: [pair.beforeMarketId, pair.afterMarketId],
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: find cheapest alternative market for a product
// ---------------------------------------------------------------------------

function findCheapestAlternative(
  productId: string,
  excludeMarketId: string,
  instance: TPPInstance,
  currentRoute: string[]
): PurchaseAssignment | null {
  let bestMarket: string | null = null;
  let bestPrice = Infinity;

  // Prefer markets already in the route to avoid adding new stops
  const sortedMarkets = [...instance.markets].sort((a, b) => {
    const aInRoute = currentRoute.includes(a.id) ? 0 : 1;
    const bInRoute = currentRoute.includes(b.id) ? 0 : 1;
    return aInRoute - bInRoute;
  });

  for (const market of sortedMarkets) {
    if (market.id === excludeMarketId) continue;
    const price = market.prices[productId];
    if (price !== null && price !== undefined && price < bestPrice) {
      bestPrice = price;
      bestMarket = market.id;
    }
  }

  if (bestMarket === null) return null;

  return {
    productId,
    marketId: bestMarket,
    quantity: 1,
    price: bestPrice,
  };
}

// ---------------------------------------------------------------------------
// Helper: find best insertion position for a market in a route
// ---------------------------------------------------------------------------

function findBestInsertionPosition(
  marketId: string,
  route: string[],
  instance: TPPInstance
): number {
  if (route.length === 0) return 0;

  let bestPos = 0;
  let bestCost = Infinity;

  for (let i = 0; i <= route.length; i++) {
    const testRoute = [...route.slice(0, i), marketId, ...route.slice(i)];
    const cost = computeTravelCost(testRoute, instance);
    if (cost < bestCost) {
      bestCost = cost;
      bestPos = i;
    }
  }

  return bestPos;
}

// ---------------------------------------------------------------------------
// Map violation types to repair operators
// ---------------------------------------------------------------------------

function applyRepairForViolation(
  solution: Solution,
  violation: RuleViolation,
  rule: IncompatibilityRule,
  instance: TPPInstance,
  rulebook: Rulebook,
  stepNum: number
): { solution: Solution; step: HeuristicStep } | null {
  switch (rule.type) {
    case 'forbidden_market':
      return removeForbiddenMarket(solution, violation, instance, rulebook, stepNum);

    case 'must_visit_market':
      return addMustVisitMarket(solution, violation, instance, rulebook, stepNum);

    case 'forbidden_purchase_assignment':
    case 'market_forbids_product':
      return reassignForbiddenPurchase(solution, violation, instance, rulebook, stepNum);

    case 'products_cannot_share_market':
      return separateIncompatibleProducts(solution, violation, instance, rulebook, stepNum);

    case 'route_forbidden_edge':
      return fixForbiddenEdge(solution, violation, instance, rulebook, stepNum);

    case 'route_requires_edge':
      return addRequiredEdge(solution, violation, instance, rulebook, stepNum);

    case 'route_precedence':
      return fixPrecedence(solution, violation, instance, rulebook, stepNum, rule);

    case 'product_requires_market':
      // If a product is purchased but its required market is not visited, add it
      return addMustVisitMarket(solution, violation, instance, rulebook, stepNum);

    case 'must_buy_product_at_market': {
      // Reassign the product to the required market
      const productId = rule.productIds?.[0];
      const marketId = rule.marketIds?.[0];
      if (!productId || !marketId) return null;

      const market = instance.markets.find((m) => m.id === marketId);
      if (!market) return null;
      const price = market.prices[productId];
      if (price === null || price === undefined) return null;

      const newRoute = [...solution.route];
      if (!newRoute.includes(marketId)) {
        const pos = findBestInsertionPosition(marketId, newRoute, instance);
        newRoute.splice(pos, 0, marketId);
      }

      // Replace existing assignment for this product
      const newAssignments = solution.assignments.filter((a) => a.productId !== productId);
      newAssignments.push({ productId, marketId, quantity: 1, price });

      const newSolution = rebuildSolution(newRoute, newAssignments, instance, rulebook);
      return {
        solution: newSolution,
        step: {
          stepNumber: stepNum,
          action: 'reassignToRequiredMarket',
          explanation: `Reassigned product ${productId} to required market ${marketId}.`,
          solution: newSolution,
          highlightedMarkets: [marketId],
          highlightedProducts: [productId],
        },
      };
    }

    default:
      // Some violations (budget_limit, max_markets, etc.) are harder to repair
      // automatically. Return null to indicate no automatic repair available.
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main Repair Loop
// ---------------------------------------------------------------------------

/**
 * Iteratively apply repair operators to fix rule violations in a solution.
 * Returns the repaired solution and the sequence of repair steps taken.
 * Stops when no more violations can be automatically repaired or after
 * a maximum number of iterations to prevent infinite loops.
 */
export function repairSolution(
  instance: TPPInstance,
  solution: Solution,
  rulebook: Rulebook
): { solution: Solution; steps: HeuristicStep[] } {
  const MAX_ITERATIONS = 50;
  const steps: HeuristicStep[] = [];
  let currentSolution = { ...solution };
  let stepNum = 1;

  // Build a map from rule ID to rule for quick lookup
  const ruleMap = new Map(rulebook.rules.map((r) => [r.id, r]));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const violations = validateSolution(instance, currentSolution, rulebook);

    // Only try to repair hard violations
    const hardViolations = violations.filter((v) => v.severity === 'hard');
    if (hardViolations.length === 0) break;

    let repaired = false;

    for (const violation of hardViolations) {
      const rule = ruleMap.get(violation.ruleId);
      if (!rule) continue;

      const result = applyRepairForViolation(
        currentSolution,
        violation,
        rule,
        instance,
        rulebook,
        stepNum
      );

      if (result) {
        currentSolution = result.solution;
        steps.push(result.step);
        stepNum++;
        repaired = true;
        break; // Re-validate after each repair to avoid cascading issues
      }
    }

    if (!repaired) break; // No repair operator could fix any remaining violation
  }

  return { solution: currentSolution, steps };
}

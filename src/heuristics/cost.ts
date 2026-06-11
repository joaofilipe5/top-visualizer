// ============================================================================
// TPP Visualizer — Cost & Distance Utility Functions
// ============================================================================
// Pure functions for computing distances, route costs, purchase costs,
// and penalty costs. These serve as the mathematical foundation for all
// heuristic algorithms.
// ============================================================================

import type { Market, Depot, PurchaseAssignment, RuleViolation } from '../types';

/**
 * Large penalty applied to hard constraint violations.
 * This value is intentionally high so that any hard violation
 * makes the solution clearly worse than any feasible alternative.
 */
export const HARD_VIOLATION_PENALTY = 1_000_000;

// ----------------------------------------------------------------------------
// Distance
// ----------------------------------------------------------------------------

/**
 * Computes the Euclidean distance between two 2D points.
 *
 * @param a - First point with x, y coordinates
 * @param b - Second point with x, y coordinates
 * @returns The straight-line distance between a and b
 */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ----------------------------------------------------------------------------
// Route Cost
// ----------------------------------------------------------------------------

/**
 * Computes the total travel cost of a route that starts at the depot,
 * visits each market in the given order, and returns to the depot.
 *
 * The route is: depot → route[0] → route[1] → ... → route[n-1] → depot
 *
 * The raw Euclidean distance is multiplied by `travelCostMultiplier` to
 * allow scenarios where travel is cheap or expensive relative to purchase cost.
 *
 * @param route - Ordered array of market IDs to visit
 * @param markets - All markets in the instance (used for coordinate lookup)
 * @param depot - The depot location (start and end of route)
 * @param travelCostMultiplier - Scalar applied to the total distance
 * @returns The total travel cost (distance × multiplier)
 */
export function routeCost(
  route: string[],
  markets: Market[],
  depot: Depot,
  travelCostMultiplier: number
): number {
  if (route.length === 0) return 0;

  let totalDistance = 0;

  // Depot → first market
  const firstMarket = getMarketById(route[0], markets);
  totalDistance += distance(depot, firstMarket);

  // Market-to-market legs
  for (let i = 0; i < route.length - 1; i++) {
    const fromMarket = getMarketById(route[i], markets);
    const toMarket = getMarketById(route[i + 1], markets);
    totalDistance += distance(fromMarket, toMarket);
  }

  // Last market → depot
  const lastMarket = getMarketById(route[route.length - 1], markets);
  totalDistance += distance(lastMarket, depot);

  return totalDistance * travelCostMultiplier;
}

// ----------------------------------------------------------------------------
// Purchase Cost
// ----------------------------------------------------------------------------

/**
 * Computes the total purchase cost from a set of product assignments.
 * Each assignment specifies a product, the market it's bought at,
 * the quantity purchased, and the unit price.
 *
 * @param assignments - Array of purchase assignments
 * @returns Sum of (price × quantity) across all assignments
 */
export function purchaseCost(assignments: PurchaseAssignment[]): number {
  let total = 0;
  for (const a of assignments) {
    total += a.price * a.quantity;
  }
  return total;
}

// ----------------------------------------------------------------------------
// Penalty Cost
// ----------------------------------------------------------------------------

/**
 * Computes the total penalty cost from all rule violations.
 * Each violation carries a numeric penalty; this function sums them all.
 *
 * Hard violations should already carry the HARD_VIOLATION_PENALTY value
 * in their `penalty` field; soft violations carry a user-defined penalty.
 *
 * @param violations - Array of rule violations detected in the solution
 * @returns Sum of penalties
 */
export function computePenaltyCost(violations: RuleViolation[]): number {
  let total = 0;
  for (const v of violations) {
    total += v.penalty;
  }
  return total;
}

// ----------------------------------------------------------------------------
// Total Cost
// ----------------------------------------------------------------------------

/**
 * Combines all cost components into a single scalar objective value.
 * This is the value heuristics seek to minimize.
 *
 * @param travelCost - Cost of travelling the route
 * @param purchaseCostVal - Cost of purchasing all products
 * @param penaltyCost - Cost from constraint violations
 * @returns The sum of all cost components
 */
export function totalCost(
  travelCost: number,
  purchaseCostVal: number,
  penaltyCost: number
): number {
  return travelCost + purchaseCostVal + penaltyCost;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Looks up a market by its ID from the array of all markets.
 * Throws an error if the market is not found, which indicates a bug
 * in the calling code (referencing a non-existent market).
 *
 * @param id - The market ID to look up
 * @param markets - Array of all markets in the instance
 * @returns The Market object with the given ID
 * @throws Error if no market with the given ID exists
 */
export function getMarketById(id: string, markets: Market[]): Market {
  const market = markets.find((m) => m.id === id);
  if (!market) {
    throw new Error(`Market with ID "${id}" not found.`);
  }
  return market;
}

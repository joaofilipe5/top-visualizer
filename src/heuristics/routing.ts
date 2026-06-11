// ============================================================================
// TPP Visualizer — Routing Algorithms
// ============================================================================
// Contains route construction (nearest-neighbor), route improvement (2-opt),
// route manipulation helpers (insert/remove), and optimal purchase assignment
// for a given set of selected markets.
// ============================================================================

import type { Market, Depot, Product, PurchaseAssignment } from '../types';
import { distance, getMarketById } from './cost';

// ----------------------------------------------------------------------------
// Nearest Neighbor Route Construction
// ----------------------------------------------------------------------------

/**
 * Builds a route visiting all selected markets using the nearest-neighbor
 * heuristic, starting from the depot.
 *
 * Algorithm:
 *   1. Begin at the depot.
 *   2. Among all unvisited markets, pick the one closest to the current location.
 *   3. Move to that market and mark it as visited.
 *   4. Repeat until all markets are visited.
 *
 * This is a greedy construction that produces reasonable (though not optimal)
 * routes quickly. It tends to work well for nearby clusters but can produce
 * poor results when the last few markets are far away.
 *
 * @param selectedMarketIds - IDs of markets that must be visited
 * @param markets - All markets in the instance
 * @param depot - The depot location
 * @returns Ordered array of market IDs forming the route
 */
export function nearestNeighborRoute(
  selectedMarketIds: string[],
  markets: Market[],
  depot: Depot
): string[] {
  if (selectedMarketIds.length === 0) return [];

  const route: string[] = [];
  const remaining = new Set(selectedMarketIds);

  // Start from the depot
  let currentPos: { x: number; y: number } = depot;

  while (remaining.size > 0) {
    let bestId = '';
    let bestDist = Infinity;

    // Find the nearest unvisited market
    for (const id of remaining) {
      const market = getMarketById(id, markets);
      const d = distance(currentPos, market);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }

    route.push(bestId);
    remaining.delete(bestId);
    currentPos = getMarketById(bestId, markets);
  }

  return route;
}

// ----------------------------------------------------------------------------
// 2-Opt Route Improvement
// ----------------------------------------------------------------------------

/**
 * Improves an existing route using the 2-opt local search heuristic.
 *
 * 2-opt works by repeatedly selecting two edges in the route and checking
 * if reversing the segment between them would shorten the total distance.
 * The process continues until no further improvement is found (local optimum).
 *
 * For a route [A, B, C, D, E] with depot, the full tour is:
 *   depot → A → B → C → D → E → depot
 *
 * A 2-opt swap at positions (i, j) reverses the sub-segment route[i..j],
 * producing a new route where the segment is traversed in the opposite order.
 *
 * @param route - Current ordered array of market IDs
 * @param markets - All markets in the instance
 * @param depot - The depot location
 * @returns An improved route (or the original if no improvement is possible)
 */
export function twoOpt(
  route: string[],
  markets: Market[],
  depot: Depot
): string[] {
  if (route.length < 2) return [...route];

  let improved = true;
  let currentRoute = [...route];

  while (improved) {
    improved = false;

    for (let i = 0; i < currentRoute.length - 1; i++) {
      for (let j = i + 1; j < currentRoute.length; j++) {
        // Compute the cost delta of reversing segment [i, j]
        const delta = twoOptDelta(currentRoute, i, j, markets, depot);

        // If the reversal reduces total distance, apply it
        if (delta < -1e-10) {
          // Reverse the segment between i and j (inclusive)
          const reversed = currentRoute.slice(i, j + 1).reverse();
          for (let k = i; k <= j; k++) {
            currentRoute[k] = reversed[k - i];
          }
          improved = true;
        }
      }
    }
  }

  return currentRoute;
}

/**
 * Computes the change in total tour distance if the segment [i, j] of the
 * route were reversed. A negative value means the reversal is beneficial.
 *
 * We only need to consider the four edges affected by the reversal:
 * - The edge into position i (from position i-1 or depot)
 * - The edge out of position j (to position j+1 or depot)
 *
 * Before reversal:
 *   ... → prev(i) → route[i] → ... → route[j] → next(j) → ...
 *
 * After reversal:
 *   ... → prev(i) → route[j] → ... → route[i] → next(j) → ...
 *
 * Delta = (new edges) - (old edges)
 */
function twoOptDelta(
  route: string[],
  i: number,
  j: number,
  markets: Market[],
  depot: Depot
): number {
  const n = route.length;

  // Positions of the nodes involved
  const prevPos: { x: number; y: number } =
    i === 0 ? depot : getMarketById(route[i - 1], markets);
  const iPos = getMarketById(route[i], markets);
  const jPos = getMarketById(route[j], markets);
  const nextPos: { x: number; y: number } =
    j === n - 1 ? depot : getMarketById(route[j + 1], markets);

  // Old edges: prev→route[i] and route[j]→next
  const oldDist = distance(prevPos, iPos) + distance(jPos, nextPos);

  // New edges after reversal: prev→route[j] and route[i]→next
  const newDist = distance(prevPos, jPos) + distance(iPos, nextPos);

  return newDist - oldDist;
}

// ----------------------------------------------------------------------------
// Route Insertion Cost
// ----------------------------------------------------------------------------

/**
 * Finds the cheapest position to insert a new market into an existing route.
 * Evaluates every possible insertion position and returns the one with the
 * smallest increase in travel distance.
 *
 * For a route [A, B, C] with depot D, possible insertions of market M:
 *   Position 0: D → M → A → B → C → D
 *   Position 1: D → A → M → B → C → D
 *   Position 2: D → A → B → M → C → D
 *   Position 3: D → A → B → C → M → D
 *
 * @param route - Current route (may be empty)
 * @param marketId - ID of the market to insert
 * @param markets - All markets in the instance
 * @param depot - The depot location
 * @returns The best insertion position and the cost delta (increase in distance)
 */
export function computeRouteInsertionCost(
  route: string[],
  marketId: string,
  markets: Market[],
  depot: Depot
): { position: number; deltaCost: number } {
  const newMarket = getMarketById(marketId, markets);

  // If route is empty, the only option is position 0
  // Cost = depot → market → depot
  if (route.length === 0) {
    const deltaCost = distance(depot, newMarket) + distance(newMarket, depot);
    return { position: 0, deltaCost };
  }

  let bestPosition = 0;
  let bestDelta = Infinity;

  for (let pos = 0; pos <= route.length; pos++) {
    // Determine the nodes before and after the insertion point
    const prevPos: { x: number; y: number } =
      pos === 0 ? depot : getMarketById(route[pos - 1], markets);
    const nextPos: { x: number; y: number } =
      pos === route.length ? depot : getMarketById(route[pos], markets);

    // Old edge: prev → next
    const oldEdge = distance(prevPos, nextPos);

    // New edges: prev → newMarket → next
    const newEdges = distance(prevPos, newMarket) + distance(newMarket, nextPos);

    const delta = newEdges - oldEdge;

    if (delta < bestDelta) {
      bestDelta = delta;
      bestPosition = pos;
    }
  }

  return { position: bestPosition, deltaCost: bestDelta };
}

// ----------------------------------------------------------------------------
// Route Manipulation
// ----------------------------------------------------------------------------

/**
 * Inserts a market ID into a route at the specified position.
 * Returns a new array (does not mutate the input).
 *
 * @param route - Current route
 * @param marketId - Market ID to insert
 * @param position - 0-based index where the market should be inserted
 * @returns A new route array with the market inserted
 */
export function insertMarketIntoRoute(
  route: string[],
  marketId: string,
  position: number
): string[] {
  const newRoute = [...route];
  newRoute.splice(position, 0, marketId);
  return newRoute;
}

/**
 * Removes a market ID from the route.
 * Returns a new array (does not mutate the input).
 * If the market is not in the route, the original route is returned unchanged.
 *
 * @param route - Current route
 * @param marketId - Market ID to remove
 * @returns A new route array without the specified market
 */
export function removeMarketFromRoute(
  route: string[],
  marketId: string
): string[] {
  return route.filter((id) => id !== marketId);
}

// ----------------------------------------------------------------------------
// Purchase Assignment
// ----------------------------------------------------------------------------

/**
 * For each product, assigns it to the cheapest market among the selected
 * markets that sells it. This is the optimal purchase plan given a fixed
 * set of visited markets.
 *
 * If a product is not available at any selected market, it is omitted from
 * the assignments (the solution will be infeasible, but that's for the
 * caller to detect and handle).
 *
 * @param selectedMarketIds - IDs of markets included in the solution
 * @param products - All products that need to be purchased
 * @param markets - All markets in the instance
 * @returns Array of purchase assignments (one per product that can be covered)
 */
export function computeBestPurchaseAssignment(
  selectedMarketIds: string[],
  products: Product[],
  markets: Market[]
): PurchaseAssignment[] {
  const assignments: PurchaseAssignment[] = [];

  // Build a lookup set for fast membership testing
  const selectedSet = new Set(selectedMarketIds);

  for (const product of products) {
    let bestMarketId = '';
    let bestPrice = Infinity;

    // Search through all selected markets for the cheapest price
    for (const marketId of selectedSet) {
      const market = getMarketById(marketId, markets);
      const price = market.prices[product.id];

      // price is null if the product is not available at this market
      if (price != null && price < bestPrice) {
        bestPrice = price;
        bestMarketId = marketId;
      }
    }

    // Only add assignment if we found a market that sells this product
    if (bestMarketId !== '') {
      assignments.push({
        productId: product.id,
        marketId: bestMarketId,
        quantity: product.demand,
        price: bestPrice,
      });
    }
  }

  return assignments;
}

// ============================================================================
// TPP Visualizer — Local Search Improvement
// ============================================================================
// Post-construction improvement heuristic that iteratively applies small
// modifications (moves) to reduce total cost. Uses first-improvement strategy:
// as soon as an improving move is found, it is applied immediately.
//
// Moves:
//   1. addMarket   — Try adding each unselected market; check if it reduces cost
//   2. dropMarket  — Try removing each selected market; reassign its products
//   3. swapMarket  — Try swapping each selected with each unselected market
//   4. reassignProduct — Try moving each product to a different selected market
//   5. twoOptImprove  — Run 2-opt on the current route
//
// The search stops when no improving move is found in a full pass.
// ============================================================================

import type {
  TPPInstance,
  Rulebook,
  HeuristicStep,
  Solution,
  PurchaseAssignment,
  SearchMode,
} from '../types';
import {
  routeCost,
  purchaseCost,
  computePenaltyCost,
  totalCost,
  getMarketById,
  HARD_VIOLATION_PENALTY,
} from './cost';
import {
  twoOpt,
  nearestNeighborRoute,
  computeRouteInsertionCost,
  insertMarketIntoRoute,
  removeMarketFromRoute,
  computeBestPurchaseAssignment,
} from './routing';
import { checkRulebook } from './ruleChecker';

// ----------------------------------------------------------------------------
// Helper: Build a Solution object
// ----------------------------------------------------------------------------

function buildSolution(
  route: string[],
  selectedMarkets: string[],
  assignments: PurchaseAssignment[],
  instance: TPPInstance,
  rulebook?: Rulebook
): Solution {
  const travel = routeCost(
    route,
    instance.markets,
    instance.depot,
    instance.travelCostMultiplier
  );
  const purchase = purchaseCost(assignments);
  const violations = rulebook
    ? checkRulebook(rulebook, { route, selectedMarkets, assignments }, instance)
    : [];
  const penalty = computePenaltyCost(violations);
  const allCovered = instance.products.every((p) =>
    assignments.some((a) => a.productId === p.id)
  );

  return {
    route,
    selectedMarkets,
    assignments,
    travelCost: travel,
    purchaseCost: purchase,
    penaltyCost: penalty,
    totalCost: totalCost(travel, purchase, penalty),
    feasible: allCovered && violations.length === 0,
    violations,
  };
}

// ----------------------------------------------------------------------------
// Move: Add Market
// ----------------------------------------------------------------------------

/**
 * Tries adding each unselected market to the solution.
 * A market is added if doing so reduces total cost (e.g., by enabling
 * cheaper product assignments that outweigh the extra travel).
 *
 * Returns the first improving result found, or null if none improves.
 */
function tryAddMarket(
  currentSolution: Solution,
  instance: TPPInstance,
  rulebook?: Rulebook
): {
  solution: Solution;
  marketId: string;
  oldCost: number;
  newCost: number;
} | null {
  const { markets, products, depot } = instance;
  const selectedSet = new Set(currentSolution.selectedMarkets);

  for (const market of markets) {
    if (selectedSet.has(market.id)) continue;

    // Check if this market offers any product improvement
    let hasUsefulProduct = false;
    for (const product of products) {
      const price = market.prices[product.id];
      if (price == null) continue;

      const currentAssignment = currentSolution.assignments.find(
        (a) => a.productId === product.id
      );
      if (!currentAssignment || price < currentAssignment.price) {
        hasUsefulProduct = true;
        break;
      }
    }

    if (!hasUsefulProduct) continue;

    // Find best insertion position
    const { position } = computeRouteInsertionCost(
      currentSolution.route,
      market.id,
      markets,
      depot
    );

    const newRoute = insertMarketIntoRoute(
      currentSolution.route,
      market.id,
      position
    );
    const newSelected = [...currentSolution.selectedMarkets, market.id];
    const newAssignments = computeBestPurchaseAssignment(
      newSelected,
      products,
      markets
    );

    const candidate = buildSolution(
      newRoute,
      newSelected,
      newAssignments,
      instance,
      rulebook
    );

    if (candidate.totalCost < currentSolution.totalCost - 1e-10) {
      return {
        solution: candidate,
        marketId: market.id,
        oldCost: currentSolution.totalCost,
        newCost: candidate.totalCost,
      };
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Move: Drop Market
// ----------------------------------------------------------------------------

/**
 * Tries removing each selected market from the solution.
 * When a market is removed, its products are reassigned to remaining markets
 * (if possible). The move is accepted if total cost decreases — this happens
 * when the travel savings outweigh any purchase cost increase from reassignment.
 */
function tryDropMarket(
  currentSolution: Solution,
  instance: TPPInstance,
  rulebook?: Rulebook
): {
  solution: Solution;
  marketId: string;
  oldCost: number;
  newCost: number;
} | null {
  const { markets, products, depot } = instance;

  for (const marketId of currentSolution.selectedMarkets) {
    // Can't drop if this is the only market
    if (currentSolution.selectedMarkets.length <= 1) continue;

    const newSelected = currentSolution.selectedMarkets.filter(
      (id) => id !== marketId
    );
    const newRoute = removeMarketFromRoute(currentSolution.route, marketId);

    // Reassign products optimally among remaining markets
    const newAssignments = computeBestPurchaseAssignment(
      newSelected,
      products,
      markets
    );

    // Check if all products are still covered
    const allCovered = products.every((p) =>
      newAssignments.some((a) => a.productId === p.id)
    );

    // If products become uncovered, add a heavy penalty to the cost
    // so we don't accept the move in strict mode
    const candidate = buildSolution(
      newRoute,
      newSelected,
      newAssignments,
      instance,
      rulebook
    );

    // Only accept if the solution is still feasible (all products covered)
    // and the cost improves
    if (
      allCovered &&
      candidate.totalCost < currentSolution.totalCost - 1e-10
    ) {
      return {
        solution: candidate,
        marketId,
        oldCost: currentSolution.totalCost,
        newCost: candidate.totalCost,
      };
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Move: Swap Market
// ----------------------------------------------------------------------------

/**
 * Tries swapping each selected market with each unselected market.
 * This can improve the solution when a different market covers the same
 * products at similar cost but is better positioned for the route.
 */
function trySwapMarket(
  currentSolution: Solution,
  instance: TPPInstance,
  rulebook?: Rulebook
): {
  solution: Solution;
  removedMarketId: string;
  addedMarketId: string;
  oldCost: number;
  newCost: number;
} | null {
  const { markets, products, depot } = instance;
  const selectedSet = new Set(currentSolution.selectedMarkets);

  for (const removeId of currentSolution.selectedMarkets) {
    for (const market of markets) {
      if (selectedSet.has(market.id)) continue;
      const addId = market.id;

      // Build new selected set: remove one, add another
      const newSelected = currentSolution.selectedMarkets
        .filter((id) => id !== removeId)
        .concat(addId);

      // Reassign products optimally
      const newAssignments = computeBestPurchaseAssignment(
        newSelected,
        products,
        markets
      );

      // Check coverage
      const allCovered = products.every((p) =>
        newAssignments.some((a) => a.productId === p.id)
      );

      if (!allCovered) continue;

      // Rebuild route: remove old market, insert new one
      const routeWithout = removeMarketFromRoute(
        currentSolution.route,
        removeId
      );
      const { position } = computeRouteInsertionCost(
        routeWithout,
        addId,
        markets,
        depot
      );
      const newRoute = insertMarketIntoRoute(routeWithout, addId, position);

      const candidate = buildSolution(
        newRoute,
        newSelected,
        newAssignments,
        instance,
        rulebook
      );

      if (candidate.totalCost < currentSolution.totalCost - 1e-10) {
        return {
          solution: candidate,
          removedMarketId: removeId,
          addedMarketId: addId,
          oldCost: currentSolution.totalCost,
          newCost: candidate.totalCost,
        };
      }
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Move: Reassign Product
// ----------------------------------------------------------------------------

/**
 * Tries moving each product assignment to a different selected market.
 * This can improve the solution when the initial assignment was suboptimal
 * (e.g., after a market swap changed the set of visited markets).
 */
function tryReassignProduct(
  currentSolution: Solution,
  instance: TPPInstance,
  rulebook?: Rulebook
): {
  solution: Solution;
  productId: string;
  fromMarketId: string;
  toMarketId: string;
  oldCost: number;
  newCost: number;
} | null {
  const { markets, products } = instance;
  const selectedSet = new Set(currentSolution.selectedMarkets);

  for (const assignment of currentSolution.assignments) {
    for (const marketId of selectedSet) {
      if (marketId === assignment.marketId) continue;

      const market = getMarketById(marketId, markets);
      const price = market.prices[assignment.productId];

      // Skip if the product is not available at this market
      if (price == null) continue;

      // Skip if not cheaper
      if (price >= assignment.price) continue;

      const product = products.find((p) => p.id === assignment.productId);
      if (!product) continue;

      // Build new assignments with this product moved
      const newAssignments = currentSolution.assignments.map((a) => {
        if (a.productId === assignment.productId) {
          return {
            ...a,
            marketId,
            price,
          };
        }
        return a;
      });

      const candidate = buildSolution(
        currentSolution.route,
        currentSolution.selectedMarkets,
        newAssignments,
        instance,
        rulebook
      );

      if (candidate.totalCost < currentSolution.totalCost - 1e-10) {
        return {
          solution: candidate,
          productId: assignment.productId,
          fromMarketId: assignment.marketId,
          toMarketId: marketId,
          oldCost: currentSolution.totalCost,
          newCost: candidate.totalCost,
        };
      }
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Move: 2-opt Improvement
// ----------------------------------------------------------------------------

/**
 * Applies 2-opt to the current route and returns an improved solution
 * if the route distance decreases.
 */
function tryTwoOpt(
  currentSolution: Solution,
  instance: TPPInstance,
  rulebook?: Rulebook
): {
  solution: Solution;
  oldCost: number;
  newCost: number;
} | null {
  const { markets, products, depot } = instance;

  const improvedRoute = twoOpt(currentSolution.route, markets, depot);

  // Check if the route actually changed
  const sameRoute =
    improvedRoute.length === currentSolution.route.length &&
    improvedRoute.every((id, idx) => id === currentSolution.route[idx]);

  if (sameRoute) return null;

  const candidate = buildSolution(
    improvedRoute,
    currentSolution.selectedMarkets,
    currentSolution.assignments,
    instance,
    rulebook
  );

  if (candidate.totalCost < currentSolution.totalCost - 1e-10) {
    return {
      solution: candidate,
      oldCost: currentSolution.totalCost,
      newCost: candidate.totalCost,
    };
  }

  return null;
}

// ----------------------------------------------------------------------------
// Main Local Search
// ----------------------------------------------------------------------------

/**
 * Local search improvement for the Traveling Purchaser Problem.
 *
 * Takes an initial solution and iteratively applies small modifications
 * (moves) to reduce total cost. Uses a first-improvement strategy:
 * the first move that improves the objective is applied immediately,
 * and the search restarts from the new solution.
 *
 * The search cycles through move types in order:
 *   1. Reassign products (cheapest to evaluate)
 *   2. Drop a market (reduces complexity)
 *   3. Add a market (increases solution quality)
 *   4. Swap markets (combines drop + add)
 *   5. 2-opt route improvement
 *
 * Terminates when a full cycle through all move types finds no improvement.
 *
 * @param instance - The TPP instance
 * @param initialSolution - Starting solution to improve
 * @param rulebook - Optional constraint rulebook
 * @param searchMode - 'strict' (only feasible moves), 'repair', or 'penalty'
 * @returns Array of HeuristicSteps documenting each improvement
 */
export function localSearchImprove(
  instance: TPPInstance,
  initialSolution: Solution,
  rulebook?: Rulebook,
  searchMode: SearchMode = 'strict'
): HeuristicStep[] {
  const steps: HeuristicStep[] = [];
  let stepNumber = 0;
  let current = { ...initialSolution };

  const { markets, products } = instance;

  // ---- Step 0: Show initial solution ----
  steps.push({
    stepNumber: stepNumber++,
    action: 'Initialize local search',
    explanation:
      `Starting local search from initial solution. ` +
      `Total cost: $${current.totalCost.toFixed(2)} ` +
      `(travel: $${current.travelCost.toFixed(2)}, ` +
      `purchase: $${current.purchaseCost.toFixed(2)}, ` +
      `penalty: $${current.penaltyCost.toFixed(2)}). ` +
      `Mode: ${searchMode}. Moves: reassign, drop, add, swap, 2-opt.`,
    solution: { ...current },
  });

  // ---- Main improvement loop ----
  let improved = true;
  let totalIterations = 0;
  const maxIterations = 200; // Safety bound to prevent infinite loops

  while (improved && totalIterations < maxIterations) {
    improved = false;
    totalIterations++;

    // --- Move 1: Reassign products ---
    const reassignResult = tryReassignProduct(current, instance, rulebook);
    if (reassignResult) {
      current = reassignResult.solution;
      improved = true;

      const fromMarket = markets.find((m) => m.id === reassignResult.fromMarketId);
      const toMarket = markets.find((m) => m.id === reassignResult.toMarketId);
      const prod = products.find((p) => p.id === reassignResult.productId);

      steps.push({
        stepNumber: stepNumber++,
        action: 'Reassign product',
        explanation:
          `Moved "${prod?.name ?? reassignResult.productId}" ` +
          `from "${fromMarket?.name ?? reassignResult.fromMarketId}" ` +
          `to "${toMarket?.name ?? reassignResult.toMarketId}". ` +
          `Cost: $${reassignResult.oldCost.toFixed(2)} → $${reassignResult.newCost.toFixed(2)} ` +
          `(saved $${(reassignResult.oldCost - reassignResult.newCost).toFixed(2)}).`,
        solution: { ...current },
        highlightedProducts: [reassignResult.productId],
        highlightedMarkets: [reassignResult.fromMarketId, reassignResult.toMarketId],
      });
      continue; // Restart search from this improved solution
    }

    // --- Move 2: Drop market ---
    const dropResult = tryDropMarket(current, instance, rulebook);
    if (dropResult) {
      current = dropResult.solution;
      improved = true;

      const droppedMarket = markets.find((m) => m.id === dropResult.marketId);

      steps.push({
        stepNumber: stepNumber++,
        action: 'Drop market',
        explanation:
          `Removed market "${droppedMarket?.name ?? dropResult.marketId}" from the solution. ` +
          `Its products were reassigned to remaining markets. ` +
          `Cost: $${dropResult.oldCost.toFixed(2)} → $${dropResult.newCost.toFixed(2)} ` +
          `(saved $${(dropResult.oldCost - dropResult.newCost).toFixed(2)}).`,
        solution: { ...current },
        highlightedMarkets: [dropResult.marketId],
      });
      continue;
    }

    // --- Move 3: Add market ---
    const addResult = tryAddMarket(current, instance, rulebook);
    if (addResult) {
      current = addResult.solution;
      improved = true;

      const addedMarket = markets.find((m) => m.id === addResult.marketId);

      steps.push({
        stepNumber: stepNumber++,
        action: 'Add market',
        explanation:
          `Added market "${addedMarket?.name ?? addResult.marketId}" to the solution. ` +
          `It offers cheaper prices for some products, offsetting the extra travel. ` +
          `Cost: $${addResult.oldCost.toFixed(2)} → $${addResult.newCost.toFixed(2)} ` +
          `(saved $${(addResult.oldCost - addResult.newCost).toFixed(2)}).`,
        solution: { ...current },
        highlightedMarkets: [addResult.marketId],
      });
      continue;
    }

    // --- Move 4: Swap markets ---
    const swapResult = trySwapMarket(current, instance, rulebook);
    if (swapResult) {
      current = swapResult.solution;
      improved = true;

      const removedMarket = markets.find(
        (m) => m.id === swapResult.removedMarketId
      );
      const addedMarket = markets.find(
        (m) => m.id === swapResult.addedMarketId
      );

      steps.push({
        stepNumber: stepNumber++,
        action: 'Swap markets',
        explanation:
          `Swapped market "${removedMarket?.name ?? swapResult.removedMarketId}" ` +
          `for "${addedMarket?.name ?? swapResult.addedMarketId}". ` +
          `Cost: $${swapResult.oldCost.toFixed(2)} → $${swapResult.newCost.toFixed(2)} ` +
          `(saved $${(swapResult.oldCost - swapResult.newCost).toFixed(2)}).`,
        solution: { ...current },
        highlightedMarkets: [swapResult.removedMarketId, swapResult.addedMarketId],
      });
      continue;
    }

    // --- Move 5: 2-opt ---
    const twoOptResult = tryTwoOpt(current, instance, rulebook);
    if (twoOptResult) {
      current = twoOptResult.solution;
      improved = true;

      steps.push({
        stepNumber: stepNumber++,
        action: '2-opt improvement',
        explanation:
          `Applied 2-opt route optimization. ` +
          `Cost: $${twoOptResult.oldCost.toFixed(2)} → $${twoOptResult.newCost.toFixed(2)} ` +
          `(saved $${(twoOptResult.oldCost - twoOptResult.newCost).toFixed(2)}).`,
        solution: { ...current },
        highlightedMarkets: current.selectedMarkets,
      });
      continue;
    }

    // If we reach here, no move improved the solution
    // improved is already false, so the loop will exit
  }

  // ---- Final summary ----
  steps.push({
    stepNumber: stepNumber++,
    action: 'Local search complete',
    explanation:
      `Local search terminated after ${totalIterations} iteration(s). ` +
      `No further improving move found. ` +
      `Final cost: $${current.totalCost.toFixed(2)} ` +
      `(travel: $${current.travelCost.toFixed(2)}, ` +
      `purchase: $${current.purchaseCost.toFixed(2)}, ` +
      `penalty: $${current.penaltyCost.toFixed(2)}). ` +
      `Improvement from initial: $${(initialSolution.totalCost - current.totalCost).toFixed(2)}. ` +
      `Markets visited: ${current.selectedMarkets.length}. ` +
      `Feasible: ${current.feasible ? 'Yes' : 'No'}.`,
    solution: { ...current },
  });

  return steps;
}

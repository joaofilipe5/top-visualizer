// ============================================================================
// TPP Visualizer — Rule Checker
// ============================================================================
// Validates a solution against a Rulebook and returns all violated rules.
// Each rule type is checked independently, producing RuleViolation objects
// that include severity, penalty, and affected entities.
// ============================================================================

import type {
  TPPInstance,
  Rulebook,
  IncompatibilityRule,
  RuleViolation,
  PurchaseAssignment,
} from '../types';
import { distance, getMarketById, HARD_VIOLATION_PENALTY } from './cost';

/**
 * Partial solution representation used during construction.
 * Heuristics pass in the current route, selected markets, and assignments
 * so we don't need to construct a full Solution object just for checking.
 */
export type PartialSolution = {
  route: string[];
  selectedMarkets: string[];
  assignments: PurchaseAssignment[];
};

/**
 * Checks all enabled rules in the rulebook against the given partial solution.
 * Returns an array of RuleViolation objects for each violated rule.
 *
 * @param rulebook - The rulebook containing constraint rules
 * @param solution - The partial solution to check
 * @param instance - The TPP instance (for market coordinates, etc.)
 * @returns Array of violations found
 */
export function checkRulebook(
  rulebook: Rulebook,
  solution: PartialSolution,
  instance: TPPInstance
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rulebook.rules) {
    if (!rule.enabled) continue;

    const violation = checkRule(rule, solution, instance);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Checks a single rule against the solution.
 * Returns a RuleViolation if violated, or null if the rule is satisfied.
 */
function checkRule(
  rule: IncompatibilityRule,
  solution: PartialSolution,
  instance: TPPInstance
): RuleViolation | null {
  const penalty =
    rule.severity === 'hard'
      ? (rule.penalty ?? HARD_VIOLATION_PENALTY)
      : (rule.penalty ?? 100);

  switch (rule.type) {
    // ---- Product incompatibility: two products cannot be bought at the same market ----
    case 'products_cannot_share_market': {
      if (!rule.productIds || rule.productIds.length < 2) return null;
      const [pid1, pid2] = rule.productIds;
      const a1 = solution.assignments.find((a) => a.productId === pid1);
      const a2 = solution.assignments.find((a) => a.productId === pid2);
      if (a1 && a2 && a1.marketId === a2.marketId) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Products "${pid1}" and "${pid2}" are both assigned to market "${a1.marketId}", violating incompatibility rule.`,
          penalty,
          affectedProducts: [pid1, pid2],
          affectedMarkets: [a1.marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Products cannot be bought together (in the same solution at all) ----
    case 'products_cannot_be_bought_together': {
      if (!rule.productIds || rule.productIds.length < 2) return null;
      const [p1, p2] = rule.productIds;
      const has1 = solution.assignments.some((a) => a.productId === p1);
      const has2 = solution.assignments.some((a) => a.productId === p2);
      if (has1 && has2) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Products "${p1}" and "${p2}" cannot be purchased together in the same solution.`,
          penalty,
          affectedProducts: [p1, p2],
          affectedMarkets: [],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Two markets cannot both be visited ----
    case 'markets_cannot_both_be_visited': {
      if (!rule.marketIds || rule.marketIds.length < 2) return null;
      const [m1, m2] = rule.marketIds;
      const selectedSet = new Set(solution.selectedMarkets);
      if (selectedSet.has(m1) && selectedSet.has(m2)) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Markets "${m1}" and "${m2}" cannot both be visited.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [m1, m2],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- If you visit a market, you must also buy a specific product ----
    case 'market_requires_product': {
      if (!rule.marketIds?.[0] || !rule.productIds?.[0]) return null;
      const marketId = rule.marketIds[0];
      const productId = rule.productIds[0];
      const selectedSet = new Set(solution.selectedMarkets);
      if (selectedSet.has(marketId)) {
        const hasProduct = solution.assignments.some(
          (a) => a.productId === productId && a.marketId === marketId
        );
        if (!hasProduct) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Market "${marketId}" is visited but product "${productId}" is not purchased there.`,
            penalty,
            affectedProducts: [productId],
            affectedMarkets: [marketId],
            affectedEdges: [],
          };
        }
      }
      return null;
    }

    // ---- If you buy product A, you must also buy product B ----
    case 'product_requires_product': {
      if (!rule.productIds || rule.productIds.length < 2) return null;
      const [prereq, dependent] = rule.productIds;
      const hasDep = solution.assignments.some((a) => a.productId === dependent);
      const hasPrereq = solution.assignments.some((a) => a.productId === prereq);
      if (hasDep && !hasPrereq) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Product "${dependent}" requires product "${prereq}" to also be purchased.`,
          penalty,
          affectedProducts: [prereq, dependent],
          affectedMarkets: [],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- A product must be bought at a specific market ----
    case 'product_requires_market': {
      if (!rule.productIds?.[0] || !rule.marketIds?.[0]) return null;
      const productId = rule.productIds[0];
      const marketId = rule.marketIds[0];
      const assignment = solution.assignments.find(
        (a) => a.productId === productId
      );
      if (assignment && assignment.marketId !== marketId) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Product "${productId}" must be purchased at market "${marketId}", but is assigned to "${assignment.marketId}".`,
          penalty,
          affectedProducts: [productId],
          affectedMarkets: [marketId, assignment.marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- A market cannot sell a specific product ----
    case 'market_forbids_product': {
      if (!rule.marketIds?.[0] || !rule.productIds?.[0]) return null;
      const marketId = rule.marketIds[0];
      const productId = rule.productIds[0];
      const violation = solution.assignments.some(
        (a) => a.marketId === marketId && a.productId === productId
      );
      if (violation) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Product "${productId}" is forbidden from being purchased at market "${marketId}".`,
          penalty,
          affectedProducts: [productId],
          affectedMarkets: [marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- A specific edge is forbidden in the route ----
    case 'route_forbidden_edge': {
      if (!rule.edge) return null;
      const { fromMarketId, toMarketId } = rule.edge;
      for (let i = 0; i < solution.route.length - 1; i++) {
        if (
          solution.route[i] === fromMarketId &&
          solution.route[i + 1] === toMarketId
        ) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `The edge from "${fromMarketId}" to "${toMarketId}" is forbidden in the route.`,
            penalty,
            affectedProducts: [],
            affectedMarkets: [fromMarketId, toMarketId],
            affectedEdges: [{ fromMarketId, toMarketId }],
          };
        }
      }
      return null;
    }

    // ---- A specific edge is required in the route ----
    case 'route_requires_edge': {
      if (!rule.edge) return null;
      const { fromMarketId, toMarketId } = rule.edge;
      const selectedSet = new Set(solution.selectedMarkets);
      // Only check if both markets are visited
      if (!selectedSet.has(fromMarketId) || !selectedSet.has(toMarketId))
        return null;
      let found = false;
      for (let i = 0; i < solution.route.length - 1; i++) {
        if (
          solution.route[i] === fromMarketId &&
          solution.route[i + 1] === toMarketId
        ) {
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `The route must include the edge from "${fromMarketId}" to "${toMarketId}".`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [fromMarketId, toMarketId],
          affectedEdges: [{ fromMarketId, toMarketId }],
        };
      }
      return null;
    }

    // ---- Maximum distance between consecutive markets in the route ----
    case 'route_max_distance_between_markets': {
      const maxDist = rule.value ?? Infinity;
      for (let i = 0; i < solution.route.length - 1; i++) {
        const m1 = getMarketById(solution.route[i], instance.markets);
        const m2 = getMarketById(solution.route[i + 1], instance.markets);
        const d = distance(m1, m2);
        if (d > maxDist) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Distance between "${solution.route[i]}" and "${solution.route[i + 1]}" is ${d.toFixed(2)}, exceeding maximum ${maxDist}.`,
            penalty,
            affectedProducts: [],
            affectedMarkets: [solution.route[i], solution.route[i + 1]],
            affectedEdges: [
              {
                fromMarketId: solution.route[i],
                toMarketId: solution.route[i + 1],
              },
            ],
          };
        }
      }
      return null;
    }

    // ---- Market A must appear before market B in the route ----
    case 'route_precedence': {
      if (!rule.orderedPair) return null;
      const { beforeMarketId, afterMarketId } = rule.orderedPair;
      const selectedSet = new Set(solution.selectedMarkets);
      if (!selectedSet.has(beforeMarketId) || !selectedSet.has(afterMarketId))
        return null;
      const beforeIdx = solution.route.indexOf(beforeMarketId);
      const afterIdx = solution.route.indexOf(afterMarketId);
      if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx > afterIdx) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Market "${beforeMarketId}" must be visited before "${afterMarketId}" in the route.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [beforeMarketId, afterMarketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Budget limit: total cost must not exceed a value ----
    case 'budget_limit': {
      const budget = rule.value ?? Infinity;
      const totalPurchase = solution.assignments.reduce(
        (sum, a) => sum + a.price * a.quantity,
        0
      );
      if (totalPurchase > budget) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Purchase cost $${totalPurchase.toFixed(2)} exceeds budget limit $${budget.toFixed(2)}.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Max number of markets visited ----
    case 'max_markets': {
      const maxM = rule.value ?? Infinity;
      if (solution.selectedMarkets.length > maxM) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Visiting ${solution.selectedMarkets.length} markets exceeds the maximum of ${maxM}.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: solution.selectedMarkets,
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Min number of markets visited ----
    case 'min_markets': {
      const minM = rule.value ?? 0;
      if (solution.selectedMarkets.length < minM) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Visiting ${solution.selectedMarkets.length} markets is below the minimum of ${minM}.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: solution.selectedMarkets,
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Must visit a specific market ----
    case 'must_visit_market': {
      if (!rule.marketIds?.[0]) return null;
      const marketId = rule.marketIds[0];
      const selectedSet = new Set(solution.selectedMarkets);
      if (!selectedSet.has(marketId)) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Market "${marketId}" must be visited but is not in the solution.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Forbidden market: must not be visited ----
    case 'forbidden_market': {
      if (!rule.marketIds?.[0]) return null;
      const marketId = rule.marketIds[0];
      const selectedSet = new Set(solution.selectedMarkets);
      if (selectedSet.has(marketId)) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Market "${marketId}" is forbidden but is included in the solution.`,
          penalty,
          affectedProducts: [],
          affectedMarkets: [marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Must buy a specific product at a specific market ----
    case 'must_buy_product_at_market': {
      if (!rule.productIds?.[0] || !rule.marketIds?.[0]) return null;
      const productId = rule.productIds[0];
      const marketId = rule.marketIds[0];
      const found = solution.assignments.some(
        (a) => a.productId === productId && a.marketId === marketId
      );
      if (!found) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Product "${productId}" must be purchased at market "${marketId}".`,
          penalty,
          affectedProducts: [productId],
          affectedMarkets: [marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    // ---- Forbidden purchase assignment ----
    case 'forbidden_purchase_assignment': {
      if (!rule.productIds?.[0] || !rule.marketIds?.[0]) return null;
      const productId = rule.productIds[0];
      const marketId = rule.marketIds[0];
      const found = solution.assignments.some(
        (a) => a.productId === productId && a.marketId === marketId
      );
      if (found) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Product "${productId}" is forbidden from being purchased at market "${marketId}".`,
          penalty,
          affectedProducts: [productId],
          affectedMarkets: [marketId],
          affectedEdges: [],
        };
      }
      return null;
    }

    default:
      return null;
  }
}

import { useCallback, useEffect } from 'react';
import { TPPProvider, useTPP } from './state/context';
import CanvasView from './components/CanvasView';
import ProductPanel from './components/ProductPanel';
import ControlPanel from './components/ControlPanel';

import { generateInstance } from './data/generator';
import { cheapestPurchaseFirst } from './heuristics/cheapestPurchaseFirst';
import { greedyMarketInsertion } from './heuristics/greedyInsertion';
import { regretConstruction } from './heuristics/regretConstruction';
import { productAnxietyConstruction } from './heuristics/productAnxiety';
import { localSearchImprove } from './heuristics/localSearch';
import { computeBestPurchaseAssignment } from './heuristics/routing';
import { routeCost, purchaseCost } from './heuristics/cost';
import { nearestNeighborRoute, twoOpt } from './heuristics/routing';
import { validateSolution } from './rules/validation';
import type { HeuristicType, Solution } from './types';

// ============================================================================
// Inner App — must be inside TPPProvider to use context
// ============================================================================

function AppInner() {
  const { state, dispatch } = useTPP();
  const { instance, solution, uiSettings, rulebook, generationConfig } = state;

  // ---- Generate instance on first load ----
  useEffect(() => {
    if (!instance) {
      try {
        const inst = generateInstance(generationConfig);
        dispatch({ type: 'SET_INSTANCE', payload: inst });
      } catch {
        // silently fail on first load
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Run selected heuristic ----
  const runHeuristic = useCallback(
    (heuristic: HeuristicType) => {
      if (!instance) return;

      let steps: import('./types').HeuristicStep[] | undefined;
      try {
        switch (heuristic) {
          case 'cheapestPurchaseFirst':
            steps = cheapestPurchaseFirst(instance, rulebook);
            break;
          case 'greedyInsertion':
            steps = greedyMarketInsertion(instance, rulebook);
            break;
          case 'regretConstruction':
            steps = regretConstruction(instance, 0.5, rulebook);
            break;
          case 'productAnxiety':
            steps = productAnxietyConstruction(instance, rulebook);
            break;
          case 'localSearch': {
            // Local search needs an initial solution — run cheapest first if none
            let startSolution = solution;
            if (!startSolution || startSolution.selectedMarkets.length === 0) {
              const initSteps = cheapestPurchaseFirst(instance, rulebook);
              if (initSteps.length > 0) {
                startSolution = initSteps[initSteps.length - 1].solution;
              }
            }
            if (startSolution) {
              steps = localSearchImprove(instance, startSolution, rulebook, uiSettings.searchMode);
            } else {
              steps = [];
            }
            break;
          }
        }
      } catch (err) {
        console.error('Heuristic error:', err);
        steps = [];
      }

      if (steps && steps.length > 0) {
        dispatch({ type: 'SET_HEURISTIC_STEPS', payload: steps });
        // Set the initial solution from the first step
        dispatch({ type: 'SET_SOLUTION', payload: steps[0].solution });
      }
    },
    [instance, solution, rulebook, uiSettings.searchMode, dispatch]
  );

  // ---- When user clicks Step but there are no steps yet, run the heuristic first ----
  useEffect(() => {
    if (
      state.heuristicSteps.length === 0 &&
      (state.isRunning || state.currentStepIndex >= 0) &&
      instance
    ) {
      // Only auto-run if there are no steps yet
      if (state.isRunning) {
        runHeuristic(uiSettings.selectedHeuristic);
      }
    }
  }, [state.isRunning, state.heuristicSteps.length, instance, runHeuristic, uiSettings.selectedHeuristic, state.currentStepIndex]);

  // ---- Recompute assignments when markets toggled manually ----
  useEffect(() => {
    if (!instance || !solution) return;
    if (solution.selectedMarkets.length === 0) return;

    // Recompute best purchase assignment for current selected markets
    const assignments = computeBestPurchaseAssignment(
      solution.selectedMarkets,
      instance.products,
      instance.markets
    );

    // Rebuild route with nearest neighbor and 2-opt
    let route = nearestNeighborRoute(
      solution.selectedMarkets,
      instance.markets,
      instance.depot
    );
    route = twoOpt(route, instance.markets, instance.depot);

    const travel = routeCost(route, instance.markets, instance.depot, instance.travelCostMultiplier);
    const purchase = purchaseCost(assignments);

    const updatedSolution: Solution = {
      ...solution,
      route,
      assignments,
      travelCost: travel,
      purchaseCost: purchase,
      penaltyCost: 0,
      totalCost: travel + purchase,
      feasible: true,
      violations: [],
    };

    // Validate against rulebook
    const violations = validateSolution(instance, updatedSolution, rulebook);
    updatedSolution.violations = violations;
    updatedSolution.penaltyCost = violations.reduce((sum, v) => sum + v.penalty, 0);
    updatedSolution.totalCost = travel + purchase + updatedSolution.penaltyCost;
    updatedSolution.feasible = violations.every((v) => v.severity !== 'hard');

    // Only update if something actually changed (prevent infinite loops)
    if (
      JSON.stringify(solution.assignments) !== JSON.stringify(assignments) ||
      JSON.stringify(solution.route) !== JSON.stringify(route)
    ) {
      dispatch({ type: 'SET_SOLUTION', payload: updatedSolution });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solution?.selectedMarkets?.length]);

  // ---- Handle keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Space = Run/Pause toggle
            if (state.isRunning) {
              dispatch({ type: 'SET_PAUSED', payload: true });
            } else {
              if (state.heuristicSteps.length === 0) {
                runHeuristic(uiSettings.selectedHeuristic);
              }
              dispatch({ type: 'SET_RUNNING', payload: true });
            }
          } else {
            // Space = Step
            if (state.heuristicSteps.length === 0) {
              runHeuristic(uiSettings.selectedHeuristic);
            } else {
              dispatch({ type: 'STEP_FORWARD' });
            }
          }
          break;
        case 'KeyR':
          if (!e.metaKey && !e.ctrlKey) {
            dispatch({ type: 'RESET_SOLUTION' });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isRunning, state.isPaused, state.heuristicSteps.length, uiSettings.selectedHeuristic, dispatch, runHeuristic]);

  return (
    <div className="app-layout">
      <header className="app-header" id="app-header">
        <div className="app-header__brand">
          <span className="app-header__icon">◆</span>
          <h1 className="app-header__title">TPP Visualizer</h1>
        </div>
        <div className="app-header__actions">
          {instance && (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => runHeuristic(uiSettings.selectedHeuristic)}
              id="btn-run-heuristic"
            >
              ▶ Run {uiSettings.selectedHeuristic === 'cheapestPurchaseFirst' ? 'Cheapest'
                : uiSettings.selectedHeuristic === 'greedyInsertion' ? 'Greedy'
                : uiSettings.selectedHeuristic === 'regretConstruction' ? 'Regret'
                : uiSettings.selectedHeuristic === 'productAnxiety' ? 'Anxiety'
                : 'Local Search'}
            </button>
          )}
          <span className="text-xs text-muted">
            Space: Step · Shift+Space: Run · R: Reset
          </span>
        </div>
      </header>
      <div className="app-body">
        <ProductPanel />
        <CanvasView />
        <ControlPanel />
      </div>
    </div>
  );
}

// ============================================================================
// Root App — wraps everything in the provider
// ============================================================================

export default function App() {
  return (
    <TPPProvider>
      <AppInner />
    </TPPProvider>
  );
}

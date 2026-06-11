import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type {
  AppState,
  AppAction,
  Solution,
} from '../types';
import {
  DEFAULT_UI_SETTINGS,
  DEFAULT_GENERATION_CONFIG,
  DEFAULT_CONSTRAINT_CONFIG,
  EMPTY_RULEBOOK,
  EMPTY_SOLUTION,
} from '../types';

// ============================================================================
// Initial State
// ============================================================================

const initialState: AppState = {
  instance: null,
  solution: null,
  heuristicSteps: [],
  currentStepIndex: -1,
  isRunning: false,
  isPaused: false,
  rulebook: { ...EMPTY_RULEBOOK },
  uiSettings: { ...DEFAULT_UI_SETTINGS },
  generationConfig: { ...DEFAULT_GENERATION_CONFIG },
  constraintConfig: { ...DEFAULT_CONSTRAINT_CONFIG },
};

// ============================================================================
// Reducer
// ============================================================================

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INSTANCE':
      return {
        ...state,
        instance: action.payload,
        solution: null,
        heuristicSteps: [],
        currentStepIndex: -1,
        isRunning: false,
        isPaused: false,
      };

    case 'SET_SOLUTION':
      return {
        ...state,
        solution: action.payload,
      };

    case 'SET_HEURISTIC_STEPS':
      return {
        ...state,
        heuristicSteps: action.payload,
        currentStepIndex: -1,
      };

    case 'SET_CURRENT_STEP': {
      const idx = Math.max(-1, Math.min(action.payload, state.heuristicSteps.length - 1));
      const solution = idx >= 0 ? state.heuristicSteps[idx].solution : state.solution;
      return {
        ...state,
        currentStepIndex: idx,
        solution: solution ?? state.solution,
      };
    }

    case 'STEP_FORWARD': {
      if (state.heuristicSteps.length === 0) return state;
      const nextIdx = Math.min(state.currentStepIndex + 1, state.heuristicSteps.length - 1);
      if (nextIdx === state.currentStepIndex) {
        // Already at end – stop running
        return { ...state, isRunning: false, isPaused: false };
      }
      return {
        ...state,
        currentStepIndex: nextIdx,
        solution: state.heuristicSteps[nextIdx].solution,
      };
    }

    case 'STEP_BACKWARD': {
      if (state.heuristicSteps.length === 0) return state;
      const prevIdx = Math.max(-1, state.currentStepIndex - 1);
      const solution: Solution | null =
        prevIdx >= 0
          ? state.heuristicSteps[prevIdx].solution
          : { ...EMPTY_SOLUTION };
      return {
        ...state,
        currentStepIndex: prevIdx,
        solution,
      };
    }

    case 'SET_RUNNING':
      return {
        ...state,
        isRunning: action.payload,
        isPaused: action.payload ? false : state.isPaused,
      };

    case 'SET_PAUSED':
      return {
        ...state,
        isPaused: action.payload,
        isRunning: action.payload ? false : state.isRunning,
      };

    case 'SET_RULEBOOK':
      return {
        ...state,
        rulebook: action.payload,
      };

    case 'UPDATE_UI_SETTINGS':
      return {
        ...state,
        uiSettings: { ...state.uiSettings, ...action.payload },
      };

    case 'UPDATE_GENERATION_CONFIG':
      return {
        ...state,
        generationConfig: { ...state.generationConfig, ...action.payload },
      };

    case 'UPDATE_CONSTRAINT_CONFIG':
      return {
        ...state,
        constraintConfig: { ...state.constraintConfig, ...action.payload },
      };

    case 'TOGGLE_MARKET': {
      if (!state.solution) return state;
      const marketId = action.payload;
      const selected = state.solution.selectedMarkets;
      const isSelected = selected.includes(marketId);
      const newSelected = isSelected
        ? selected.filter((id) => id !== marketId)
        : [...selected, marketId];
      // Also update the route: add/remove from end
      const newRoute = isSelected
        ? state.solution.route.filter((id) => id !== marketId)
        : [...state.solution.route, marketId];
      return {
        ...state,
        solution: {
          ...state.solution,
          selectedMarkets: newSelected,
          route: newRoute,
        },
      };
    }

    case 'ADD_MARKET': {
      if (!state.instance) return state;
      const newId = `m${state.instance.markets.length + 1}`;
      const newMarket = {
        id: newId,
        name: `Market ${newId}`,
        x: action.payload.x,
        y: action.payload.y,
        prices: {},
      };
      return {
        ...state,
        instance: { ...state.instance, markets: [...state.instance.markets, newMarket] },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'UPDATE_MARKET': {
      if (!state.instance) return state;
      const markets = state.instance.markets.map(m => 
        m.id === action.payload.id ? { ...m, ...action.payload.market } : m
      );
      return {
        ...state,
        instance: { ...state.instance, markets },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'REMOVE_MARKET': {
      if (!state.instance) return state;
      const markets = state.instance.markets.filter(m => m.id !== action.payload);
      return {
        ...state,
        instance: { ...state.instance, markets },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'UPDATE_PRODUCT': {
      if (!state.instance) return state;
      const products = state.instance.products.map(p => 
        p.id === action.payload.id ? { ...p, ...action.payload.product } : p
      );
      return {
        ...state,
        instance: { ...state.instance, products },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'ADD_PRODUCT': {
      if (!state.instance) return state;
      const newId = `p${state.instance.products.length + 1}`;
      const newProduct = {
        id: newId,
        name: action.payload.name,
        demand: action.payload.demand,
      };
      return {
        ...state,
        instance: { ...state.instance, products: [...state.instance.products, newProduct] },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'REMOVE_PRODUCT': {
      if (!state.instance) return state;
      const products = state.instance.products.filter(p => p.id !== action.payload);
      // Also remove prices for this product from all markets
      const markets = state.instance.markets.map(m => {
        const { [action.payload]: removedPrice, ...remainingPrices } = m.prices;
        return { ...m, prices: remainingPrices };
      });
      return {
        ...state,
        instance: { ...state.instance, products, markets },
        solution: null, heuristicSteps: [], currentStepIndex: -1, isRunning: false, isPaused: false
      };
    }

    case 'RESET_SOLUTION':
      return {
        ...state,
        solution: null,
        heuristicSteps: [],
        currentStepIndex: -1,
        isRunning: false,
        isPaused: false,
      };

    case 'RESET_ALL':
      return { ...initialState };

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

type TPPContextType = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
};

const TPPContext = createContext<TPPContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function TPPProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <TPPContext.Provider value={{ state, dispatch }}>
      {children}
    </TPPContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useTPP(): TPPContextType {
  const ctx = useContext(TPPContext);
  if (!ctx) {
    throw new Error('useTPP must be used within a TPPProvider');
  }
  return ctx;
}

export { TPPContext };

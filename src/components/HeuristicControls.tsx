import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useTPP } from '../state/context';
import type { HeuristicType, SearchMode } from '../types';

const HEURISTIC_LABELS: Record<HeuristicType, string> = {
  cheapestPurchaseFirst: 'Cheapest',
  greedyInsertion: 'Greedy',
  regretConstruction: 'Regret',
  productAnxiety: 'Anxiety',
  localSearch: 'Local Search',
};

const HEURISTIC_LIST: HeuristicType[] = [
  'cheapestPurchaseFirst',
  'greedyInsertion',
  'regretConstruction',
  'productAnxiety',
  'localSearch',
];

const SEARCH_MODES: { mode: SearchMode; label: string }[] = [
  { mode: 'strict', label: 'Strict' },
  { mode: 'repair', label: 'Repair' },
  { mode: 'penalty', label: 'Penalty' },
];

export default function HeuristicControls() {
  const { state, dispatch } = useTPP();
  const { uiSettings, heuristicSteps, currentStepIndex, isRunning, isPaused, instance } = state;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasSteps = heuristicSteps.length > 0;
  const atEnd = currentStepIndex >= heuristicSteps.length - 1;
  const atStart = currentStepIndex <= -1;
  const progress = hasSteps
    ? ((currentStepIndex + 1) / heuristicSteps.length) * 100
    : 0;

  // Auto-step when running
  useEffect(() => {
    if (isRunning && !isPaused && hasSteps && !atEnd) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'STEP_FORWARD' });
      }, uiSettings.animationSpeed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused, hasSteps, atEnd, uiSettings.animationSpeed, dispatch]);

  // Stop running when we reach the end
  useEffect(() => {
    if (isRunning && atEnd) {
      dispatch({ type: 'SET_RUNNING', payload: false });
    }
  }, [isRunning, atEnd, dispatch]);

  const selectHeuristic = useCallback(
    (h: HeuristicType) => {
      dispatch({ type: 'UPDATE_UI_SETTINGS', payload: { selectedHeuristic: h } });
    },
    [dispatch]
  );

  const handleStep = useCallback(() => {
    dispatch({ type: 'STEP_FORWARD' });
  }, [dispatch]);

  const handleRun = useCallback(() => {
    dispatch({ type: 'SET_RUNNING', payload: true });
  }, [dispatch]);

  const handlePause = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', payload: true });
  }, [dispatch]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_SOLUTION' });
  }, [dispatch]);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({
        type: 'UPDATE_UI_SETTINGS',
        payload: { animationSpeed: parseInt(e.target.value, 10) },
      });
    },
    [dispatch]
  );

  const handleSearchMode = useCallback(
    (mode: SearchMode) => {
      dispatch({ type: 'UPDATE_UI_SETTINGS', payload: { searchMode: mode } });
    },
    [dispatch]
  );

  const noInstance = !instance;

  // Memoize progress text
  const progressText = useMemo(() => {
    if (!hasSteps) return 'No steps';
    return `Step ${currentStepIndex + 1} of ${heuristicSteps.length}`;
  }, [hasSteps, currentStepIndex, heuristicSteps.length]);

  return (
    <section aria-label="Heuristic controls" id="heuristic-controls">
      {/* Heuristic Selector */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Heuristic</div>
        <div className="pill-group" style={{ flexWrap: 'wrap' }}>
          {HEURISTIC_LIST.map((h) => (
            <button
              key={h}
              className={`pill-btn ${uiSettings.selectedHeuristic === h ? 'pill-btn--active' : ''}`}
              onClick={() => selectHeuristic(h)}
              disabled={noInstance}
              id={`heuristic-btn-${h}`}
              aria-pressed={uiSettings.selectedHeuristic === h}
            >
              {HEURISTIC_LABELS[h]}
            </button>
          ))}
        </div>
      </div>

      {/* Control Buttons */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="btn-row" style={{ marginBottom: 'var(--sp-2)' }}>
          <button
            className="btn btn--secondary"
            onClick={handleStep}
            disabled={noInstance || (hasSteps && atEnd)}
            id="btn-step"
            aria-label="Step forward"
          >
            ▶ Step
          </button>
          <button
            className="btn btn--primary"
            onClick={handleRun}
            disabled={noInstance || isRunning || (hasSteps && atEnd)}
            id="btn-run"
            aria-label="Run heuristic"
          >
            ▶▶ Run
          </button>
          <button
            className="btn btn--secondary"
            onClick={handlePause}
            disabled={!isRunning}
            id="btn-pause"
            aria-label="Pause"
          >
            ⏸ Pause
          </button>
        </div>
        <div className="btn-row">
          <button
            className="btn btn--ghost"
            onClick={() => dispatch({ type: 'STEP_BACKWARD' })}
            disabled={noInstance || atStart}
            id="btn-step-back"
            aria-label="Step backward"
          >
            ◀ Back
          </button>
          <button
            className="btn btn--danger btn--sm"
            onClick={handleReset}
            disabled={noInstance}
            id="btn-reset"
            aria-label="Reset solution"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Progress */}
      {hasSteps && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-1)' }}>
            <span className="text-xs text-muted">{progressText}</span>
            {isRunning && <span className="badge badge--accent">Running</span>}
            {isPaused && <span className="badge badge--soft">Paused</span>}
          </div>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Speed Slider */}
      <div className="slider-group" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="slider-group__header">
          <span className="input-group__label">Speed</span>
          <span className="slider-group__value">{uiSettings.animationSpeed}ms</span>
        </div>
        <input
          type="range"
          min={50}
          max={2000}
          step={50}
          value={uiSettings.animationSpeed}
          onChange={handleSpeedChange}
          id="speed-slider"
          aria-label="Animation speed"
        />
      </div>

      {/* Search Mode */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Search Mode</div>
        <div className="pill-group">
          {SEARCH_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              className={`pill-btn ${uiSettings.searchMode === mode ? 'pill-btn--active' : ''}`}
              onClick={() => handleSearchMode(mode)}
              id={`search-mode-${mode}`}
              aria-pressed={uiSettings.searchMode === mode}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Export */}
      <button
        className="btn btn--secondary w-full"
        disabled={!state.solution}
        id="btn-export-solution"
        onClick={() => {
          if (!state.solution) return;
          const blob = new Blob([JSON.stringify(state.solution, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'tpp-solution.json';
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Export Solution
      </button>
    </section>
  );
}

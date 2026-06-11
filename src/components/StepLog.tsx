import { useRef, useEffect, useMemo } from 'react';
import { useTPP } from '../state/context';

export default function StepLog() {
  const { state } = useTPP();
  const { heuristicSteps, currentStepIndex } = state;
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current step
  useEffect(() => {
    if (currentCardRef.current) {
      currentCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStepIndex]);

  const visibleSteps = useMemo(() => {
    // Show all steps up to and including current step, or all if no stepping
    return heuristicSteps;
  }, [heuristicSteps]);

  if (visibleSteps.length === 0) {
    return (
      <div className="placeholder">
        <span className="placeholder__icon">📝</span>
        <span className="placeholder__text">Run a heuristic to see step-by-step log</span>
      </div>
    );
  }

  return (
    <section className="panel-scrollable" ref={scrollRef} aria-label="Step log" id="step-log">
      {visibleSteps.map((step) => {
        const isCurrent = step.stepNumber - 1 === currentStepIndex;
        return (
          <div
            key={step.stepNumber}
            ref={isCurrent ? currentCardRef : undefined}
            className={`step-card ${isCurrent ? 'step-card--current' : ''}`}
            id={`step-card-${step.stepNumber}`}
          >
            <div className="step-card__header">
              <span className="badge badge--step">{step.stepNumber}</span>
              <span className="step-card__action">{step.action}</span>
            </div>
            <div className="step-card__explanation">{step.explanation}</div>
            {((step.highlightedMarkets && step.highlightedMarkets.length > 0) ||
              (step.highlightedProducts && step.highlightedProducts.length > 0)) && (
              <div className="step-card__tags">
                {step.highlightedMarkets?.map((mid) => (
                  <span key={mid} className="badge badge--cyan">{mid}</span>
                ))}
                {step.highlightedProducts?.map((pid) => (
                  <span key={pid} className="badge badge--accent">{pid}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

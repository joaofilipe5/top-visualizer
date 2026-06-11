import { useMemo } from 'react';
import { useTPP } from '../state/context';

export default function ViolationsPanel() {
  const { state } = useTPP();
  const { solution } = state;

  const grouped = useMemo(() => {
    if (!solution) return { hard: [], soft: [], totalPenalty: 0 };
    const hard = solution.violations.filter((v) => v.severity === 'hard');
    const soft = solution.violations.filter((v) => v.severity === 'soft');
    const totalPenalty = soft.reduce((sum, v) => sum + v.penalty, 0);
    return { hard, soft, totalPenalty };
  }, [solution]);

  if (!solution) {
    return (
      <div className="placeholder">
        <span className="placeholder__icon">🛡️</span>
        <span className="placeholder__text">Generate a solution to check violations</span>
      </div>
    );
  }

  if (grouped.hard.length === 0 && grouped.soft.length === 0) {
    return (
      <div className="no-violations" id="no-violations-msg">
        <span>✓</span>
        <span>No Violations</span>
      </div>
    );
  }

  return (
    <section aria-label="Violations" id="violations-panel">
      {grouped.hard.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="panel-section__title" style={{ color: 'var(--color-hard-violation)' }}>
            Hard Violations ({grouped.hard.length})
          </div>
          {grouped.hard.map((v, i) => (
            <div key={`hard-${i}`} className="violation-card violation-card--hard">
              <div className="violation-card__title">{v.ruleName}</div>
              <div className="violation-card__message">{v.message}</div>
              {(v.affectedProducts.length > 0 || v.affectedMarkets.length > 0) && (
                <div className="step-card__tags" style={{ marginTop: 'var(--sp-2)' }}>
                  {v.affectedProducts.map((pid) => (
                    <span key={pid} className="badge badge--uncovered">{pid}</span>
                  ))}
                  {v.affectedMarkets.map((mid) => (
                    <span key={mid} className="badge badge--cyan">{mid}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {grouped.soft.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="panel-section__title" style={{ color: 'var(--color-soft-violation)' }}>
            Soft Violations ({grouped.soft.length})
          </div>
          {grouped.soft.map((v, i) => (
            <div key={`soft-${i}`} className="violation-card violation-card--soft">
              <div className="violation-card__title">{v.ruleName}</div>
              <div className="violation-card__message">{v.message}</div>
              <div className="violation-card__penalty" style={{ color: 'var(--color-soft-violation)' }}>
                Penalty: {v.penalty.toFixed(2)}
              </div>
              {(v.affectedProducts.length > 0 || v.affectedMarkets.length > 0) && (
                <div className="step-card__tags" style={{ marginTop: 'var(--sp-2)' }}>
                  {v.affectedProducts.map((pid) => (
                    <span key={pid} className="badge badge--uncovered">{pid}</span>
                  ))}
                  {v.affectedMarkets.map((mid) => (
                    <span key={mid} className="badge badge--cyan">{mid}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {grouped.totalPenalty > 0 && (
        <div className="glass-card glass-card--compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-sm font-semibold">Total Penalty</span>
          <span className="text-md font-bold" style={{ color: 'var(--color-soft-violation)' }}>
            {grouped.totalPenalty.toFixed(2)}
          </span>
        </div>
      )}
    </section>
  );
}

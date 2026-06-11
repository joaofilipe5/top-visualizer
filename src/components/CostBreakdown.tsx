import { useMemo } from 'react';
import { useTPP } from '../state/context';

export default function CostBreakdown() {
  const { state } = useTPP();
  const { solution } = state;

  const costs = useMemo(() => {
    if (!solution) return null;
    return {
      travel: solution.travelCost,
      purchase: solution.purchaseCost,
      penalty: solution.penaltyCost,
      total: solution.totalCost,
      feasible: solution.feasible,
      violationCount: solution.violations.length,
    };
  }, [solution]);

  if (!costs) {
    return (
      <div className="placeholder">
        <span className="placeholder__icon">📊</span>
        <span className="placeholder__text">No solution to display</span>
      </div>
    );
  }

  const fmt = (n: number) => n.toFixed(2);

  return (
    <section className="glass-card glass-card--compact" aria-label="Cost breakdown">
      <table className="table" id="cost-breakdown-table">
        <tbody>
          <tr>
            <td>Travel Cost</td>
            <td style={{ textAlign: 'right' }}>{fmt(costs.travel)}</td>
          </tr>
          <tr>
            <td>Purchase Cost</td>
            <td style={{ textAlign: 'right' }}>{fmt(costs.purchase)}</td>
          </tr>
          {costs.penalty > 0 && (
            <tr>
              <td style={{ color: 'var(--color-soft-violation)' }}>Penalty Cost</td>
              <td style={{ textAlign: 'right', color: 'var(--color-soft-violation)' }}>
                {fmt(costs.penalty)}
              </td>
            </tr>
          )}
          <tr className="table-row--total">
            <td>Total Cost</td>
            <td style={{ textAlign: 'right' }}>{fmt(costs.total)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        {costs.feasible ? (
          <span className="badge badge--feasible" id="feasibility-badge">✓ Feasible</span>
        ) : (
          <>
            <span className="badge badge--infeasible" id="feasibility-badge">✗ Infeasible</span>
            <span className="text-xs text-muted">
              {costs.violationCount} violation{costs.violationCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

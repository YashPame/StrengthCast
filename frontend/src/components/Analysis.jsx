import { LineChart } from './charts.jsx';
import { fmt } from '../lib/mix.js';

/** Strength vs age for the latest tested cube, with ±RMSE band. */
export function AgeTab({ latest, meta }) {
  if (!latest) return <p className="hint">Test a mix to see how its strength develops with curing age.</p>;
  const { test, curve } = latest;
  const { mix, result } = test;
  const at28 = curve.find(p => p.age === 28)?.strength_mpa;
  return (
    <>
      <p className="hint">
        Cube #{test.id} ({test.label}). Shaded band = ±{result.rmse_mpa.toFixed(1)} MPa typical error.
        {at28 ? ` 28-day strength ≈ ${at28.toFixed(1)} MPa.` : ''}
      </p>
      <LineChart
        className="chart"
        points={curve.map(p => ({ x: p.age, y: p.strength_mpa }))}
        xLog xTicks={meta.ages} band={result.rmse_mpa}
        marker={{ x: mix.age, y: result.strength_mpa, label: `tested at ${mix.age} d` }}
        refX={mix.age !== 28 ? { x: 28, label: '28 d design age' } : null}
        xLabel="Curing age (days, log scale)" yLabel="Strength (MPa)"
        tipX={v => `${v} days`} height={320}
      />
    </>
  );
}

/** One small chart per input, shared y-axis, for the latest tested cube. */
export function SensitivityTab({ latest, meta }) {
  if (!latest) {
    return <p className="hint">Test a mix to see how changing one ingredient (others held fixed) moves the predicted strength.</p>;
  }
  const { test, sens } = latest;
  const all = Object.values(sens.features).flatMap(f => f.strength_mpa);
  const yDomain = [Math.max(0, Math.floor(Math.min(...all) - 3)), Math.ceil(Math.max(...all) + 3)];
  return (
    <>
      <p className="hint">
        Cube #{test.id}: each panel varies one input across its training range, others held fixed.
        Shared y-axis, so steeper panels matter more. The ring marks the current value.
      </p>
      <div className="sens-grid">
        {meta.features.map(f => {
          const s = sens.features[f.name];
          const lo = Math.min(...s.strength_mpa), hi = Math.max(...s.strength_mpa);
          return (
            <div key={f.name} className="sens-cell">
              <h4>{f.label}</h4>
              <div className="sub">range of effect: {lo.toFixed(1)}–{hi.toFixed(1)} MPa (Δ {(hi - lo).toFixed(1)})</div>
              <LineChart
                points={s.x.map((x, i) => ({ x, y: s.strength_mpa[i] }))} compact width={260} height={140}
                xLog={f.name === 'age'} xTicks={f.name === 'age' ? [3, 7, 28, 90, 365] : undefined} yDomain={yDomain}
                marker={{ x: s.current, y: sens.base_strength_mpa }}
                fmtX={v => fmt(v)} tipX={v => `${f.label} ${fmt(v)} ${f.unit}`}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

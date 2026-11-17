import { BarChart } from './charts.jsx';
import { derived, fmt } from '../lib/mix.js';

export default function TestLog({ tests, selected, meta, onToggle, onLoad }) {
  return (
    <>
      <p className="hint">
        {tests.length
          ? 'Tick two or more cubes to compare them. "Load mix" puts a mix back in the panel.'
          : 'Every cube you test appears here. Tick two or more to compare.'}
      </p>
      <div className="log-grid">
        {tests.map(t => {
          const d = derived(t.mix);
          const isSel = selected.includes(t.id);
          return (
            <div key={t.id} className={`log-card ${isSel ? 'selected' : ''}`} onClick={() => onToggle(t.id)}>
              <input type="checkbox" checked={isSel} aria-label={`Select cube #${t.id} for comparison`}
                onClick={e => e.stopPropagation()} onChange={() => onToggle(t.id)} />
              <div className="t">
                #{t.id} · {t.label} · {t.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="s">{t.result.strength_mpa.toFixed(1)} <small>± {t.result.rmse_mpa.toFixed(1)} MPa</small></div>
              <div className="m">
                {t.model.label} · {t.model.model_name}<br />
                {t.mix.age} d · w/c {d.wc.toFixed(2)} · w/b {d.wb.toFixed(2)}<br />
                C {fmt(t.mix.cement)} · S {fmt(t.mix.blast_furnace_slag)} · FA {fmt(t.mix.fly_ash)} · W {fmt(t.mix.water)}
              </div>
              <div className="actions-row">
                <button className="link-btn" type="button" onClick={e => { e.stopPropagation(); onLoad(t); }}>Load mix</button>
              </div>
            </div>
          );
        })}
      </div>
      <Compare tests={tests.filter(t => selected.includes(t.id)).sort((a, b) => a.id - b.id)} meta={meta} />
    </>
  );
}

function Compare({ tests, meta }) {
  if (tests.length < 2) return null;
  const base = tests[0];
  // When the selected cubes came from different models, name the model next to each cube
  const mixedModels = new Set(tests.map(t => t.model.key)).size > 1;
  const name = t => `#${t.id} ${t.label}${mixedModels ? ` (${t.model.model_name})` : ''}`;
  const rows = [
    ...meta.features.map(f => ({ label: `${f.label} (${f.unit})`, get: t => t.mix[f.name], digits: f.name === 'superplasticizer' ? 1 : 0 })),
    { label: 'w/c ratio', get: t => derived(t.mix).wc, digits: 2 },
    { label: 'w/b ratio', get: t => derived(t.mix).wb, digits: 2 },
    { label: 'Total mass (kg/m³)', get: t => derived(t.mix).total, digits: 0 },
  ];
  const cell = (v, b, digits, isBase) => {
    const s = v.toFixed(digits);
    if (isBase) return s;
    const dv = v - b;
    const delta = Math.abs(dv) < 10 ** -digits / 2 ? '=' : `${dv > 0 ? '+' : ''}${dv.toFixed(digits)}`;
    return <>{s}<span className="delta">{delta}</span></>;
  };
  return (
    <div className="compare">
      <h3>Comparison <span className="muted">(differences relative to #{base.id})</span></h3>
      <BarChart rows={tests.map(t => ({ label: name(t), value: t.result.strength_mpa }))} />
      <div className="table-scroll">
        <table className="compare-table">
          <thead><tr><th />{tests.map(t => <th key={t.id}>{name(t)}</th>)}</tr></thead>
          <tbody>
            <tr className="result">
              <td>Predicted strength (MPa)</td>
              {tests.map((t, i) => <td key={t.id}>{cell(t.result.strength_mpa, base.result.strength_mpa, 1, i === 0)}</td>)}
            </tr>
            <tr>
              <td>Model</td>
              {tests.map(t => <td key={t.id}>{t.model.label} ({t.model.model_name})</td>)}
            </tr>
            {rows.map(r => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {tests.map((t, i) => <td key={t.id}>{cell(r.get(t), r.get(base), r.digits, i === 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

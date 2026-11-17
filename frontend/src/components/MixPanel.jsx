import { useEffect, useState } from 'react';
import IngredientIcon from './IngredientIcon.jsx';
import { derived, fmt } from '../lib/mix.js';

export default function MixPanel({
  meta, mix, presetKey, running, warnings, iconRefs,
  onValue, onPreset, onTest,
}) {
  const d = derived(mix);
  const [lo, hi] = meta.density_range;
  const [wbLo, wbHi] = meta.wb_range ?? [0, Infinity];
  const wbBad = d.wb != null && (d.wb < wbLo || d.wb > wbHi || (d.wb < meta.wb_dry_no_sp && mix.superplasticizer === 0));
  const ingredients = meta.features.filter(f => f.name !== 'age');

  return (
    <section className="panel-card" aria-label="Mix design">
      <div className="panel-head">
        <h2>Mix design <span className="muted">per m³</span></h2>
        <div className="presets">
          {Object.entries(meta.presets).map(([key, p]) => (
            <button key={key} type="button" className={`preset ${key === presetKey ? 'active' : ''}`}
              disabled={running} onClick={() => onPreset(key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ingredients">
        {ingredients.map(f => (
          <IngredientRow key={f.name} f={f} value={mix[f.name]} disabled={running}
            iconRef={el => { iconRefs.current[f.name] = el; }}
            onChange={v => onValue(f.name, v)} />
        ))}
      </div>

      <div className="age-block">
        <div className="row-label">
          <span>Curing age</span><span className="muted">{mix.age} day{mix.age === 1 ? '' : 's'}</span>
        </div>
        <div className="age-chips" role="radiogroup" aria-label="Curing age in days">
          {meta.ages.map(a => (
            <button key={a} type="button" role="radio" className="age-chip" aria-checked={mix.age === a}
              disabled={running} onClick={() => onValue('age', a)}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="derived">
        <div><span className="k">w/c ratio</span><span className="v">{d.wc == null ? '–' : d.wc.toFixed(2)}</span></div>
        <div><span className="k">w/b ratio</span><span className={`v ${wbBad ? 'bad' : ''}`}>{d.wb == null ? '–' : d.wb.toFixed(2)}</span></div>
        <div><span className="k">Binder</span><span className="v">{d.binder.toFixed(0)} kg</span></div>
        <div><span className="k">Total mass</span><span className={`v ${d.total < lo || d.total > hi ? 'bad' : ''}`}>{d.total.toFixed(0)} kg</span></div>
      </div>

      <div className="warnings" aria-live="polite">
        {warnings.map((w, i) => (
          <div key={i} className={`warn ${w.level === 'info' ? 'info' : ''}`}>{w.message}</div>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="mix-btn" onClick={onTest}
          disabled={running || !(mix.cement > 0) || !(mix.water > 0)}>
          Mix &amp; test
        </button>
      </div>
    </section>
  );
}

function IngredientRow({ f, value, disabled, iconRef, onChange }) {
  const out = value < f.min || value > f.max;
  return (
    <div className={`ing ${out ? 'out' : ''}`}>
      <IngredientIcon ref={iconRef} name={f.name} value={value} max={f.max} />
      <div className="ing-mid">
        <div className="row-label"><span>{f.label}</span><span className="muted">{fmt(f.min)}–{fmt(f.max)}</span></div>
        <input type="range" min={f.min} max={f.max} step={f.step} value={value} disabled={disabled}
          aria-label={f.label} onChange={e => onChange(+e.target.value)} />
      </div>
      <label className="num">
        <NumberInput value={value} step={f.step} disabled={disabled} label={`${f.label} (${f.unit})`} onChange={onChange} />
        <span>kg</span>
      </label>
    </div>
  );
}

/** Lets the user type freely (empty, "12.") and only commits valid numbers. */
function NumberInput({ value, step, disabled, label, onChange }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    if (+text !== value || text === '') setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input type="number" step={step} min="0" aria-label={label} value={text} disabled={disabled}
      onChange={e => {
        setText(e.target.value);
        if (e.target.value === '' || Number.isNaN(+e.target.value)) return;
        onChange(+e.target.value);
      }}
      onBlur={() => setText(fmt(value))} />
  );
}

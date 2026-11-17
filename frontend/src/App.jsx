import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { INGREDIENTS } from './components/IngredientIcon.jsx';
import MixPanel from './components/MixPanel.jsx';
import StageView from './components/StageView.jsx';
import TestLog from './components/TestLog.jsx';
import { AgeTab, SensitivityTab } from './components/Analysis.jsx';
import { TooltipProvider } from './components/Tooltip.jsx';
import { localWarnings } from './lib/mix.js';

const STEPS = [
  ['charge', 'Charge'], ['mix', 'Mix'], ['cast', 'Cast'], ['cure', 'Cure'], ['test', 'Test'],
];
const TABS = [['log', 'Test log'], ['age', 'Strength vs age'], ['sens', 'Sensitivity']];

// Hover text for a model: typical error for known mixes, for brand-new mix designs, and whether it is constrained.
function modelTitle(md) {
  const m = md.metrics;
  const lines = [`${md.label} ${md.model_name}`,
    `Typical error ±${m.test_RMSE.toFixed(2)} MPa (held-out test set, MAE ${m.test_MAE?.toFixed(2) ?? '–'} MPa).`];
  if (m.new_mix_grouped_cv_RMSE != null) {
    lines.push(`Brand-new mix designs: ±${m.new_mix_grouped_cv_RMSE.toFixed(2)} MPa (grouped CV R² ${m.new_mix_grouped_cv_R2.toFixed(3)}).`);
  }
  lines.push(md.constrained
    ? 'Physics-constrained: strength never falls with age or cement, never rises with water.'
    : 'Not constrained: age curves and sensitivity charts can show bumps that contradict concrete physics.');
  return lines.join('\n');
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [mix, setMix] = useState(null);
  const [presetKey, setPresetKey] = useState(null);
  const [modelKey, setModelKey] = useState(null);   // which model the next test uses
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(null);
  // Server warnings from the last test stay visible until the mix is edited.
  const [serverWarnings, setServerWarnings] = useState(null);
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState([]);
  const [latest, setLatest] = useState(null); // { test, curve, sens } of the newest cube
  const [tab, setTab] = useState('log');

  const stageRef = useRef(null);
  const iconRefs = useRef({});
  const nextId = useRef(1);

  // ------------------------------------------------------------ boot
  useEffect(() => {
    api('meta')
      .then(m => {
        setMeta(m);
        setMix({ ...m.presets[m.default_preset].mix });
        setPresetKey(m.default_preset);
        setModelKey(m.default_model);
      })
      .catch(err => setApiError(err.message));
  }, []);

  // ------------------------------------------------------------ editing
  const setValue = useCallback((name, v) => {
    setMix(m => ({ ...m, [name]: v }));
    setPresetKey(null);
    setServerWarnings(null);
  }, []);

  const applyMix = useCallback((m, key = null) => {
    setMix({ ...m });
    setPresetKey(key);
    setServerWarnings(null);
  }, []);

  // ------------------------------------------------------------ mix & test
  async function mixAndTest() {
    if (running) return;
    setRunning(true);
    const m = { ...mix };
    const label = presetKey ? meta.presets[presetKey].label : 'Custom';
    const model = meta.models.find(md => md.key === modelKey);
    const q = `?model=${encodeURIComponent(model.key)}`;
    try {
      const curvesP = Promise.all([api(`age-curve${q}`, m), api(`sensitivity${q}`, m)]);
      const result = await api(`predict${q}`, m);
      setServerWarnings(result.warnings);
      // The animation always plays, except for users whose OS asks for reduced motion
      const noAnim = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // On narrow screens the stage sits above the panel: bring it into view before animating
      const stageEl = stageRef.current.element();
      const sr = stageEl.getBoundingClientRect();
      if (!noAnim && (sr.top < 0 || sr.bottom > window.innerHeight)) {
        stageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 450));
      }
      const flyers = Object.entries(iconRefs.current)
        .filter(([, el]) => el)
        .map(([name, el]) => ({ el, color: INGREDIENTS[name].color, amount: m[name] }));
      await stageRef.current.run(result, m, { skip: noAnim, flyers });

      const test = { id: nextId.current++, mix: m, result, label, model, time: new Date() };
      setTests(t => [test, ...t]);
      const [curve, sens] = await curvesP;
      setLatest({ test, curve, sens });
    } catch (err) {
      setServerWarnings([{ level: 'warning', message: `Prediction failed: ${err.message}` }]);
      stageRef.current?.reset();
    } finally {
      setRunning(false);
    }
  }

  const toggleSelected = id =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const loadMix = t => {
    applyMix(t.mix, null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ------------------------------------------------------------ render
  const activeModel = meta?.models.find(md => md.key === modelKey);
  const metrics = activeModel?.metrics;
  const warnings = apiError
    ? [{ level: 'warning', message: `Could not reach the prediction API (${apiError}). Start the server from the backend folder with: uvicorn app:app --reload` }]
    : serverWarnings ?? (meta && mix ? localWarnings(mix, meta) : []);
  const stepIdx = step === 'done' ? STEPS.length : STEPS.findIndex(([k]) => k === step);

  return (
    <TooltipProvider>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" className="brand-icon" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3l3 8-3 10M16 3l-3 8 3 10" />
          </svg>
          <div>
            <h1>StrengthCast <span className="tagline">Know the strength before you pour.</span></h1>
            <p>Machine Learning-Based Concrete Compressive Strength Prediction</p>
          </div>
        </div>
        <div className="model-switch">
          {meta && meta.models.length > 1 && (
            <div className="presets" role="radiogroup" aria-label="Prediction model">
              {meta.models.map(md => (
                <button key={md.key} type="button" role="radio" aria-checked={md.key === modelKey}
                  className={`preset ${md.key === modelKey ? 'active' : ''}`} disabled={running}
                  title={modelTitle(md)} onClick={() => setModelKey(md.key)}>
                  {md.label}
                </button>
              ))}
            </div>
          )}
          <div className="model-chip" title={activeModel ? modelTitle(activeModel) : undefined}>
            {apiError ? 'API unavailable'
              : metrics ? `${activeModel.model_name} · test R² ${metrics.test_R2.toFixed(3)} · RMSE ${metrics.test_RMSE.toFixed(2)} MPa`
                : 'Loading model…'}
          </div>
        </div>
      </header>

      <main className="layout">
        {/* LEFT: stage */}
        <section className="stage-card" aria-label="Mixing and testing stage">
          <div className="stage-head">
            <ol className="steps">
              {STEPS.map(([key, label], i) => (
                <li key={key} className={[step !== null && i < stepIdx ? 'done' : '', i === stepIdx ? 'active' : ''].join(' ').trim()}>
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <div className="stage-wrap">
            <StageView ref={stageRef} onStep={setStep} />
          </div>
          <p className="disclaimer">Estimate for preliminary mix design only. Laboratory compression testing is still required for construction.</p>
        </section>

        {/* RIGHT: mix panel */}
        {meta && mix ? (
          <MixPanel
            meta={meta} mix={mix} presetKey={presetKey} running={running} warnings={warnings} iconRefs={iconRefs}
            onValue={setValue} onPreset={key => applyMix(meta.presets[key].mix, key)} onTest={mixAndTest}
          />
        ) : (
          <section className="panel-card" aria-label="Mix design">
            <div className="panel-head"><h2>Mix design <span className="muted">per m³</span></h2></div>
            <div className="warnings" aria-live="polite">
              {warnings.map((w, i) => <div key={i} className="warn">{w.message}</div>)}
            </div>
          </section>
        )}
      </main>

      {/* BOTTOM: drawer */}
      <section className="drawer" aria-label="Analysis">
        <div className="tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" type="button" className={`tab ${tab === key ? 'active' : ''}`}
              aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}{key === 'log' && <> <span className="badge">{tests.length}</span></>}
            </button>
          ))}
        </div>
        <div className="tab-panel">
          {tab === 'log' && meta && (
            <TestLog tests={tests} selected={selected} meta={meta} onToggle={toggleSelected} onLoad={loadMix} />
          )}
          {tab === 'age' && <AgeTab latest={latest} meta={meta} />}
          {tab === 'sens' && <SensitivityTab latest={latest} meta={meta} />}
        </div>
      </section>
    </TooltipProvider>
  );
}

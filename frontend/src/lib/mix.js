// Client-side derived values and warnings, so the panel reacts instantly while typing.
// The server repeats these checks in /api/predict and its warnings win after a test.

export const INGREDIENT_KEYS = ['cement', 'blast_furnace_slag', 'fly_ash', 'water', 'superplasticizer', 'coarse_aggregate', 'fine_aggregate'];

export const fmt = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : (+v).toFixed(1));

export function derived(mix) {
  const binder = mix.cement + mix.blast_furnace_slag + mix.fly_ash;
  const total = INGREDIENT_KEYS.reduce((a, k) => a + mix[k], 0);
  return { wc: mix.cement > 0 ? mix.water / mix.cement : null, wb: binder > 0 ? mix.water / binder : null, binder, total };
}

export function localWarnings(mix, meta) {
  const out = [];
  for (const f of meta.features) {
    const v = mix[f.name];
    if (v < f.min || v > f.max) {
      out.push({ level: 'warning', message: `${f.label} ${fmt(v)} is outside the training range (${fmt(f.min)}–${fmt(f.max)}). The prediction is an extrapolation.` });
    }
  }
  const [lo, hi] = meta.density_range;
  const { total } = derived(mix);
  if (total < lo || total > hi) out.push({ level: 'warning', message: `Total mass ${total.toFixed(0)} kg/m³ is outside the realistic ${lo}–${hi} kg/m³ range for concrete.` });
  if (!(mix.cement > 0)) out.push({ level: 'warning', message: 'Cement must be greater than 0.' });
  return out;
}

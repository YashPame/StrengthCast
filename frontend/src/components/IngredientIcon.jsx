import { forwardRef } from 'react';

// Ingredient icons for the mix panel. Each icon has a `.mat` group that scales with the amount.
// Piles scale uniformly by sqrt(amount) so the drawn AREA tracks the amount (not the width).
// Liquids keep their container and fill by level (scaleY).

const Speckles = ({ fill }) => (
  <g fill={fill}>
    <circle cx="18" cy="32" r="1.3" /><circle cx="27" cy="22" r="1.1" /><circle cx="34" cy="34" r="1.4" />
    <circle cx="23" cy="38" r="1" /><circle cx="31" cy="27" r="1" /><circle cx="14" cy="40" r="1.1" />
  </g>
);

const pile = (fill, speckle) => style => (
  <g className="mat" style={style}>
    <path d="M3 43 C10 22 18 9 26 9 C34 9 42 22 49 43 Z" fill={fill} />
    <Speckles fill={speckle} />
  </g>
);

export const INGREDIENTS = {
  cement: {
    color: '#8f8b84', kind: 'pile',
    draw: style => (
      <g className="mat" style={style}>
        <rect x="6" y="22" width="40" height="21" rx="5" fill="#8f8b84" />
        <rect x="11" y="6" width="30" height="19" rx="5" fill="#a5a199" />
        <path d="M11 12 h30" stroke="#cfcac0" strokeWidth="2" />
        <path d="M6 29 h40" stroke="#b3aea5" strokeWidth="2" />
        <text x="26" y="39" fontSize="8" fontWeight="700" textAnchor="middle" fill="#efece6" fontFamily="Segoe UI, sans-serif">CEM</text>
      </g>
    ),
  },
  blast_furnace_slag: { color: '#e4dcc4', kind: 'pile', draw: pile('#e4dcc4', '#b8ad8d') },
  fly_ash: { color: '#5f6166', kind: 'pile', draw: pile('#5f6166', '#8d8f94') },
  water: {
    color: '#5aa5e6', kind: 'liquid',
    draw: style => (
      <>
        <path d="M11 4 h30 l-2 39 h-26 z" fill="#eef5fc" stroke="#9fb9d4" strokeWidth="1.5" />
        <g className="mat" style={style}><path d="M12.2 10 h27.6 l-1.7 32.4 h-24.2 z" fill="#5aa5e6" opacity=".85" /></g>
        <path d="M15 12 v26" stroke="#ffffff" strokeWidth="2" opacity=".6" strokeLinecap="round" />
      </>
    ),
  },
  superplasticizer: {
    color: '#d0902a', kind: 'liquid',
    draw: style => (
      <>
        <rect x="20" y="2" width="12" height="7" rx="1.5" fill="#3c434d" />
        <path d="M17 9 h18 v6 l4 5 v22 a2 2 0 0 1 -2 2 h-22 a2 2 0 0 1 -2 -2 v-22 l4 -5 z" fill="#f8efe0" stroke="#d6b98a" strokeWidth="1.5" />
        <g className="mat" style={style}><rect x="14.5" y="20" width="23" height="22.2" rx="1.5" fill="#d0902a" opacity=".85" /></g>
      </>
    ),
  },
  coarse_aggregate: {
    color: '#8e887e', kind: 'pile',
    draw: style => (
      <g className="mat" style={style}>
        <polygon points="4,43 9,31 18,29 22,38 19,43" fill="#8e887e" />
        <polygon points="17,43 21,30 31,26 37,33 35,43" fill="#a39d92" />
        <polygon points="33,43 36,32 45,30 49,38 47,43" fill="#7a746b" />
        <polygon points="12,31 16,20 26,17 30,26 21,30" fill="#9a9489" />
        <polygon points="26,26 31,15 40,16 42,27 35,30" fill="#857f75" />
        <polygon points="20,18 25,8 33,9 34,16 27,18" fill="#a8a296" />
      </g>
    ),
  },
  fine_aggregate: { color: '#d8bd85', kind: 'pile', draw: pile('#d8bd85', '#b39558') },
};

function matStyle(name, v, max) {
  const f = Math.max(0, Math.min(1, v / max));
  if (INGREDIENTS[name].kind === 'liquid') return { transform: `scaleY(${Math.max(0.04, f)})` };
  // Zero = ingredient not used: show a faint small placeholder instead of an empty gap
  const s = v <= 0 ? 0.55 : 0.25 + 0.75 * Math.sqrt(f);
  return { transform: `scale(${s})`, opacity: v <= 0 ? 0.18 : 1 };
}

/** The svg element is forwarded so the stage can fly a clone of it into the mixer. */
const IngredientIcon = forwardRef(function IngredientIcon({ name, value, max }, ref) {
  return (
    <svg ref={ref} className="ing-icon" viewBox="0 0 52 44" aria-hidden="true">
      {INGREDIENTS[name].draw(matStyle(name, value, max))}
    </svg>
  );
});

export default IngredientIcon;

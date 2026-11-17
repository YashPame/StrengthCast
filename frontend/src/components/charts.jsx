import { useLayoutEffect, useRef, useState } from 'react';
import { useTooltip } from './Tooltip.jsx';

// Minimal SVG charts (no library): line chart with optional ±band, marker and hover tooltip,
// and a horizontal bar chart. Single-series charts use one accent blue; text stays in ink colours.
const C = { accent: '#2a78d6', band: 'rgba(42,120,214,.12)', grid: '#e1e0d9', ink: '#0b0b0b', ink2: '#52514e', ink3: '#8a8983', surface: '#fcfcfb' };

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Width of the wrapper div, tracked on resize, so charts draw at real size (no SVG upscaling). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    setWidth(node.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * points [{x,y}], width, height, xLog, xTicks, yDomain, band, marker {x,y,label}, refX {x,label},
 * xLabel, yLabel, fmtX, fmtY, tipX, compact
 */
export function LineChart(props) {
  const [wrapRef, measured] = useWidth();
  return (
    <div ref={wrapRef} className={props.className}>
      {measured > 0 && <LineSvg {...props} width={props.width ?? Math.max(320, measured)} />}
    </div>
  );
}

function LineSvg({
  points, width, height = 300, xLog = false, band = 0, compact = false,
  fmtX = v => v, fmtY = v => v.toFixed(1), tipX, xLabel = '', yLabel = '', xTicks, yDomain, marker, refX,
}) {
  const tip = useTooltip();
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const m = compact ? { t: 8, r: 10, b: 26, l: 34 } : { t: 16, r: 24, b: 44, l: 52 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const tx = v => (xLog ? Math.log(v) : v);
  const x0 = tx(Math.min(...xs)), x1 = tx(Math.max(...xs));
  const [y0, y1] = yDomain ?? [Math.max(0, Math.min(...ys) - band - 3), Math.max(...ys) + band + 3];
  const sx = v => m.l + ((tx(v) - x0) / (x1 - x0 || 1)) * W;
  const sy = v => m.t + H - ((v - y0) / (y1 - y0 || 1)) * H;
  const fs = compact ? 10 : 11;
  const xt = xTicks ?? niceTicks(Math.min(...xs), Math.max(...xs), compact ? 3 : 6);

  function onMove(e) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = points[0];
    for (const p of points) if (Math.abs(sx(p.x) - loc.x) < Math.abs(sx(best.x) - loc.x)) best = p;
    setHover(best);
    // screen position of the hovered point
    const r = svg.getBoundingClientRect();
    const scale = r.width / width;
    tip.show(
      <>{tipX ? tipX(best.x) : fmtX(best.x)}<br /><b>{fmtY(best.y)} MPa</b></>,
      r.left + sx(best.x) * scale, r.top + sy(best.y) * scale - 5,
    );
  }
  function onLeave() { setHover(null); tip.hide(); }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img">
      {niceTicks(y0, y1, compact ? 3 : 5).map(v => (
        <g key={v}>
          <line x1={m.l} x2={m.l + W} y1={sy(v)} y2={sy(v)} stroke={C.grid} strokeWidth="1" />
          <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={fs} fill={C.ink3}>{v}</text>
        </g>
      ))}
      {xt.map(v => (
        <text key={v} x={sx(v)} y={m.t + H + (compact ? 14 : 18)} textAnchor="middle" fontSize={fs} fill={C.ink3}>{fmtX(v)}</text>
      ))}
      <line x1={m.l} x2={m.l + W} y1={m.t + H} y2={m.t + H} stroke="#cfccc3" />
      {xLabel && <text x={m.l + W / 2} y={height - 6} textAnchor="middle" fontSize="11" fill={C.ink2}>{xLabel}</text>}
      {yLabel && <text x={14} y={m.t + H / 2} textAnchor="middle" fontSize="11" fill={C.ink2} transform={`rotate(-90 14 ${m.t + H / 2})`}>{yLabel}</text>}

      {refX && (
        <>
          <line x1={sx(refX.x)} x2={sx(refX.x)} y1={m.t} y2={m.t + H} stroke={C.ink3} strokeDasharray="3 3" />
          <text x={sx(refX.x) + 4} y={m.t + 10} fontSize="10" fill={C.ink3}>{refX.label}</text>
        </>
      )}

      {band > 0 && (
        <polygon fill={C.band} points={[
          ...points.map(p => `${sx(p.x)},${sy(Math.min(y1, p.y + band))}`),
          ...points.slice().reverse().map(p => `${sx(p.x)},${sy(Math.max(y0, p.y - band))}`),
        ].join(' ')} />
      )}

      <polyline points={points.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke={C.accent}
        strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {!compact && points.map(p => (
        <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={C.accent} stroke={C.surface} strokeWidth="2" />
      ))}

      {marker && (
        <>
          <line x1={sx(marker.x)} x2={sx(marker.x)} y1={m.t} y2={m.t + H} stroke={C.ink} strokeWidth="1" opacity="0.5" />
          {marker.y != null && <circle cx={sx(marker.x)} cy={sy(marker.y)} r={compact ? 4.5 : 6} fill={C.surface} stroke={C.ink} strokeWidth="2" />}
          {marker.label && <text x={sx(marker.x) + 6} y={m.t + H - 6} fontSize="10" fill={C.ink}>{marker.label}</text>}
        </>
      )}

      {hover && (
        <>
          <line x1={sx(hover.x)} x2={sx(hover.x)} y1={m.t} y2={m.t + H} stroke={C.ink2} strokeWidth="1" opacity="0.5" />
          <circle cx={sx(hover.x)} cy={sy(hover.y)} r="5" fill={C.accent} stroke={C.surface} strokeWidth="2" />
        </>
      )}
      <rect x={m.l} y={m.t} width={W} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} />
    </svg>
  );
}

/** Horizontal bars: rows [{label, value}] */
export function BarChart({ rows, unit = 'MPa', fmt = v => v.toFixed(1) }) {
  const [wrapRef, measured] = useWidth();
  const width = Math.min(900, Math.max(320, measured || 760));
  // Label column grows with the longest label (about 6.6 px per character at 12 px), within 150–300 px
  const longest = Math.max(...rows.map(r => r.label.length));
  const rowH = 30, m = { t: 6, r: 70, b: 6, l: Math.min(300, Math.max(150, Math.round(longest * 6.6) + 16)) };
  const height = m.t + m.b + rows.length * rowH;
  const max = Math.max(...rows.map(r => r.value)) * 1.05 || 1;
  const W = width - m.l - m.r;
  return (
    <div ref={wrapRef} id="compareBars">
      {measured > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`}>
          {rows.map((r, i) => {
            const y = m.t + i * rowH;
            const bw = Math.max(2, (r.value / max) * W);
            return (
              <g key={r.label}>
                <text x={m.l - 10} y={y + rowH / 2 + 4} textAnchor="end" fill={C.ink2} fontSize="12">{r.label}</text>
                <rect x={m.l} y={y + 6} width={bw} height={rowH - 12} rx="4" fill={C.accent} />
                <text x={m.l + bw + 8} y={y + rowH / 2 + 4} fill={C.ink} fontSize="12" fontWeight="600">{fmt(r.value)} {unit}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

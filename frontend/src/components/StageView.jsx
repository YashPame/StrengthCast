import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Stage } from '../lib/stage.js';

/*
 * Left-hand stage: mixer -> mould -> curing tank -> compression testing machine.
 * The scene is a long, timed sequence of tweens, so it stays an imperative SVG class
 * (lib/stage.js). React owns the empty <svg>; the Stage class owns everything inside it.
 * Parent calls ref.current.run(result, mix, { skip, flyers }) and awaits it.
 */
const StageView = forwardRef(function StageView({ onStep }, ref) {
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const stage = new Stage(svgRef.current, { onStep: s => onStepRef.current?.(s) });
    stageRef.current = stage;
    return () => {
      for (const id of stage.raf) cancelAnimationFrame(id);
      stageRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    run: (...args) => stageRef.current.run(...args),
    reset: () => stageRef.current?.reset(),
    element: () => svgRef.current,
  }), []);

  return (
    <svg ref={svgRef} id="stage" viewBox="0 66 1000 464" role="img"
      aria-label="Concrete mixer, curing tank and compression testing machine" />
  );
});

export default StageView;

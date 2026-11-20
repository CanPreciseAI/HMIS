import * as React from "react";

import { cn } from "@/lib/utils";

type GlowingEffectProps = {
  /** How far outside the box (in px) the pointer still lights the border. */
  proximity?: number;
  /** Controls the radius of the pointer glow. */
  spread?: number;
  /** Adds the slow ambient sweep around the border. */
  glow?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Aceternity-style glowing border: a masked ring that lights up near the
 * pointer and sweeps a beam around the edge. Written with CSS variables so no
 * motion dependency is required.
 */
export function GlowingEffect({
  proximity = 64,
  spread = 40,
  glow = true,
  disabled = false,
  className,
}: GlowingEffectProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    let frame = 0;

    const handlePointer = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        const outsideX = Math.max(
          rect.left - event.clientX,
          0,
          event.clientX - rect.right,
        );
        const outsideY = Math.max(
          rect.top - event.clientY,
          0,
          event.clientY - rect.bottom,
        );
        const active = Math.hypot(outsideX, outsideY) <= proximity;

        node.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
        node.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
        node.style.setProperty("--glow-opacity", active ? "1" : "0");
      });
    };

    window.addEventListener("pointermove", handlePointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [disabled, proximity]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("cp-glow", className)}
      style={
        {
          "--glow-size": `${spread * 5}px`,
        } as React.CSSProperties
      }
    >
      <span className="cp-glow-cursor" />
      {glow && <span className="cp-glow-beam" />}
    </div>
  );
}

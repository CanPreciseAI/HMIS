import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Aceternity-style highlighter: a gradient band that sweeps across the text
 * once the phrase scrolls into view. Pure CSS so no motion dependency is
 * needed.
 */
export function Highlight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className={cn("cp-highlight", shown && "cp-highlight-on", className)}
    >
      {children}
    </span>
  );
}

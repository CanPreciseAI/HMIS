import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "success";

const RESET_DELAY = 1400;

const variants = {
  solid:
    "bg-white text-[#061020] shadow-[0_20px_50px_-18px_rgba(103,232,249,0.55)] hover:bg-cyan-50",
  outline:
    "border border-white/12 bg-white/[0.04] text-white/80 backdrop-blur hover:border-white/25 hover:text-white",
} as const;

export type StatefulButtonProps = Omit<
  React.ComponentProps<"button">,
  "onClick" | "children"
> & {
  children: React.ReactNode;
  onClick?: () => void | Promise<unknown>;
  variant?: keyof typeof variants;
  loadingLabel?: string;
  successLabel?: string;
};

export function Button({
  children,
  className,
  onClick,
  variant = "solid",
  loadingLabel = "Working…",
  successLabel = "Done",
  disabled,
  ...props
}: StatefulButtonProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const resetTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleClick = async () => {
    if (status !== "idle" || disabled) return;

    setStatus("loading");
    try {
      await onClick?.();
      setStatus("success");
      resetTimer.current = window.setTimeout(
        () => setStatus("idle"),
        RESET_DELAY,
      );
    } catch {
      setStatus("idle");
    }
  };

  const busy = status === "loading";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className={cn(
        "group relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-sm font-semibold transition-all duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030814]",
        "disabled:cursor-progress",
        variants[variant],
        status === "success" &&
          variant === "solid" &&
          "bg-emerald-200 text-[#042119]",
        status === "success" &&
          variant === "outline" &&
          "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
          variant === "solid"
            ? "bg-[linear-gradient(110deg,transparent,rgba(6,16,32,0.08),transparent)]"
            : "bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.12),transparent)]",
          busy && "opacity-100",
        )}
      />

      <span
        aria-live="polite"
        className={cn(
          "relative flex items-center gap-2 transition-transform duration-300",
          busy && "scale-[0.98]",
        )}
      >
        {status === "idle" && children}

        {busy && (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {loadingLabel}
          </>
        )}

        {status === "success" && (
          <>
            <span className="cp-stateful-pop grid size-4 place-items-center rounded-full bg-emerald-500/90 text-white">
              <Check className="size-3" aria-hidden="true" />
            </span>
            {successLabel}
          </>
        )}
      </span>
    </button>
  );
}

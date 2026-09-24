import type { CSSProperties } from "react";

type LogoTone = "default" | "light" | "dark" | "mono";
type LogoSize = "sm" | "md" | "lg";

type VetoLayerMarkProps = {
  className?: string;
  size?: number;
  color?: string;
  accent?: string;
  title?: string;
  style?: CSSProperties;
};

type VetoLayerLogoProps = {
  className?: string;
  compact?: boolean;
  tone?: LogoTone;
  size?: LogoSize;
};

/**
 * Gate-V brand mark.
 *
 * The converging rails represent an agent action moving toward execution.
 * The horizontal gate is VetoLayer's decision boundary: the action crosses it
 * only after policy, evidence, and contextual judgment have been evaluated.
 */
export function VetoLayerMark({
  className,
  size = 32,
  color = "currentColor",
  accent = "var(--brand-accent, currentColor)",
  title,
  style,
}: VetoLayerMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={style}
    >
      <path
        d="M6.4 5.5 16 27 25.6 5.5"
        stroke={color}
        strokeWidth="4.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.2 15.25h21.6"
        stroke={accent}
        strokeWidth="4.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function VetoLayerLogo({
  className,
  compact = false,
  tone = "default",
  size = "md",
}: VetoLayerLogoProps) {
  const classes = [
    "vetoLayerLogo",
    `vetoLayerLogo--${tone}`,
    `vetoLayerLogo--${size}`,
    compact ? "vetoLayerLogo--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role={compact ? "img" : undefined} aria-label={compact ? "VetoLayer" : undefined}>
      <VetoLayerMark className="vetoLayerLogoMark" />
      {compact ? null : (
        <span className="vetoLayerWordmark" aria-label="VetoLayer">
          <span>Veto</span><span className="vetoLayerWordmarkAccent">Layer</span>
        </span>
      )}
    </span>
  );
}

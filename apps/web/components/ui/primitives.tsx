import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const toneClass: Record<ButtonTone, string> = {
  primary: "vlButtonPrimary",
  secondary: "vlButtonSecondary",
  ghost: "vlButtonGhost",
  danger: "vlButtonDanger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "vlButtonSm",
  md: "",
  lg: "vlButtonLg",
};

export function Button({
  tone = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <button className={cx("vlButton", toneClass[tone], sizeClass[size], className)} {...props} />;
}

export function ButtonLink({
  href,
  children,
  tone = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: ButtonTone;
  size?: ButtonSize;
  className?: string;
}) {
  return <Link href={href} className={cx("vlButton", toneClass[tone], sizeClass[size], className)}>{children}</Link>;
}

export function Card({
  children,
  raised = false,
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { raised?: boolean; interactive?: boolean }) {
  return (
    <section className={cx("vlCard", raised && "vlCardRaised", interactive && "vlCardInteractive", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("vlCardHeader", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("vlCardBody", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("vlCardFooter", className)} {...props} />;
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const badgeToneClass: Record<BadgeTone, string> = {
  neutral: "vlBadgeNeutral",
  accent: "vlBadgeAccent",
  success: "vlBadgeSuccess",
  warning: "vlBadgeWarning",
  danger: "vlBadgeDanger",
  info: "vlBadgeInfo",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={cx("vlBadge", badgeToneClass[tone], className)}>{children}</span>;
}

export function OutcomeBadge({ outcome, className }: { outcome: "ALLOW" | "REVIEW" | "BLOCK"; className?: string }) {
  const tone: BadgeTone = outcome === "ALLOW" ? "success" : outcome === "REVIEW" ? "warning" : "danger";
  const cue = outcome === "ALLOW" ? "✓" : outcome === "REVIEW" ? "!" : "×";
  return <Badge tone={tone} className={className}><span aria-hidden="true">{cue}</span>{outcome}</Badge>;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("vlField", className)}>
      <span className="vlFieldLabel">{label}</span>
      {children}
      {error ? <span className="vlFieldError">{error}</span> : hint ? <span className="vlFieldHint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("vlInput", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("vlSelect", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("vlTextarea", className)} {...props} />;
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const toneName = tone[0].toUpperCase() + tone.slice(1);
  return (
    <div className={cx("vlNotice", `vlNotice${toneName}`, className)} role={role}>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  eyebrow,
  title,
  copy,
  action,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  copy: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("vlEmpty", className)}>
      <div className="vlEmptyInner">
        {icon ? <span className="vlEmptyIcon" aria-hidden="true">{icon}</span> : null}
        {eyebrow ? <span className="vlEyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{copy}</p>
        {action}
      </div>
    </section>
  );
}

export function Skeleton({ width = "100%", height = 14, className }: { width?: string | number; height?: string | number; className?: string }) {
  return <span className={cx("vlSkeleton", className)} style={{ width, height }} aria-hidden="true" />;
}

export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <span className={cx("vlTooltip", className)} data-tooltip={label}>{children}</span>;
}

export function Tabs({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return <div className={cx("vlTabs", className)} role="tablist" aria-label={label}>{children}</div>;
}

export function Tab({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button className={cx("vlTab", active && "vlTabActive", className)} role="tab" aria-selected={active} {...props}>{children}</button>;
}

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("vlTableShell", className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cx("vlTable", className)}>{children}</table>;
}

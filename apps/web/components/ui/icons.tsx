import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function ArrowRightIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></svg>;
}

export function CheckIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="m5 12 4 4L19 6" /></svg>;
}

export function SearchIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

export function SettingsIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2.2-.7a7.3 7.3 0 0 0-.7-1.6l1.1-2.1-2.1-2.1L13 5.1a7.3 7.3 0 0 0-1.6-.7L10.5 2h-3l-.7 2.4a7.3 7.3 0 0 0-1.6.7L3.1 4 1 6.1l1.1 2.1a7.3 7.3 0 0 0-.7 1.6L-1 10.5v3l2.4.7c.2.6.4 1.1.7 1.6L1 17.9 3.1 20l2.1-1.1c.5.3 1 .5 1.6.7l.7 2.4h3l.7-2.4c.6-.2 1.1-.4 1.6-.7l2.1 1.1 2.1-2.1-1.1-2.1c.3-.5.5-1 .7-1.6L19 13.5Z" transform="translate(2) scale(.83)" /></svg>;
}

export function DecisionIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="M5 4v16" /><path d="M5 8h7l3-3 4 3v8l-4 3-3-3H5" /></svg>;
}

export function PolicyIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="M7 3h10l3 3v15H7z" /><path d="M17 3v4h4" /><path d="M10 11h7M10 15h7" /></svg>;
}

export function ReviewIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><circle cx="12" cy="8" r="3" /><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6" /></svg>;
}

export function PlugIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="M8 3v5M16 3v5" /><path d="M6 8h12v2a6 6 0 0 1-6 6v5" /></svg>;
}

export function AlertIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size, props)}><path d="M12 4 3.5 19h17z" /><path d="M12 9v4M12 16h.01" /></svg>;
}

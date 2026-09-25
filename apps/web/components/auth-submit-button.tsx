"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui/primitives";

export function AuthSubmitButton({
  children,
  pendingLabel,
  tone = "primary",
  size = "lg",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  tone?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone={tone} size={size} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

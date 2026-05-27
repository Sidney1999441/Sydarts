"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

export function SubmitButton({
  children,
  pendingText = "处理中...",
  variant = "primary"
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

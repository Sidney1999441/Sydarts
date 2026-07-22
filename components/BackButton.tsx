"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function BackButton() {
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  return (
    <Button
      aria-label="返回上一个页面"
      className="min-h-10 shrink-0 border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 active:bg-white/15 sm:min-h-11 sm:px-4"
      title="返回上一个页面"
      type="button"
      variant="secondary"
      onClick={handleBack}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">返回</span>
    </Button>
  );
}

"use client";

import { useEffect } from "react";

export function DisplayModeChrome() {
  useEffect(() => {
    document.body.classList.add("codl-display-active");
    return () => document.body.classList.remove("codl-display-active");
  }, []);

  return null;
}

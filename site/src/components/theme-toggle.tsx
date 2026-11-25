"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";

import { Moon, Sun } from "@/components/icons";

const KEY = "pr:theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* storage can be blocked; the toggle still works for this page view */
    }
    setDark(next);
  }

  return (
    <Button
      isIconOnly
      variant="secondary"
      size="sm"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onPress={toggle}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

"use client";

import { Button } from "@/components/ui/button";

// For the casualty TV: open the dashboard, log in as the viewer, press this.
export function FullscreenButton() {
  return (
    <Button variant="outline" className="min-h-9" onClick={() => void document.documentElement.requestFullscreen?.()}>
      Full screen
    </Button>
  );
}

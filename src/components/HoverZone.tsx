import { emitTo } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

const HOVER_CHECK_MS = 250;
const HIDE_PULSE_MS = 900;

export function HoverZone() {
  const insideRef = useRef(false);
  const lastHidePulseAtRef = useRef(0);

  const emitHide = () => {
    lastHidePulseAtRef.current = Date.now();
    emitTo("main", "overlay-hover-hide").catch(() => undefined);
  };

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!insideRef.current) return;
      try {
        const win = getCurrentWindow();
        const [mouse, pos, size] = await Promise.all([
          cursorPosition(),
          win.outerPosition(),
          win.outerSize()
        ]);
        const inside =
          mouse.x >= pos.x &&
          mouse.x <= pos.x + size.width &&
          mouse.y >= pos.y &&
          mouse.y <= pos.y + size.height;

        if (!inside) {
          insideRef.current = false;
          return;
        }

        // Keep a very slow pulse only while truly inside, to recover missed events.
        const now = Date.now();
        if (now - lastHidePulseAtRef.current >= HIDE_PULSE_MS) {
          emitHide();
        }
      } catch {
        // best effort
      }
    }, HOVER_CHECK_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="hover-zone"
      onMouseEnter={() => {
        insideRef.current = true;
        emitHide();
      }}
      onMouseMove={() => {
        if (!insideRef.current) {
          insideRef.current = true;
          emitHide();
        }
      }}
      onMouseLeave={() => {
        insideRef.current = false;
      }}
    />
  );
}

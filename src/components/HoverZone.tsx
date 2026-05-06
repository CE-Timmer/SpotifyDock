import { emitTo } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

const HOVER_CHECK_MS = 550;
const HOVER_CHECK_SLOW_MS = 1200;
const HOVER_CHECK_IDLE_MS = 1800;
const HIDE_PULSE_MS = 1400;
const LOOP_LAG_MS = 260;

export function HoverZone() {
  const insideRef = useRef(false);
  const lastHidePulseAtRef = useRef(0);

  const emitHide = () => {
    lastHidePulseAtRef.current = Date.now();
    emitTo("main", "overlay-hover-hide").catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let lastTickNow = performance.now();
    let expectedDelayMs = HOVER_CHECK_IDLE_MS;

    const schedule = (ms: number) => {
      if (cancelled) return;
      expectedDelayMs = ms;
      timer = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;
      const nowPerf = performance.now();
      const lag = nowPerf - lastTickNow - expectedDelayMs;
      lastTickNow = nowPerf;

      // Under system pressure, back off instead of fighting for mouse time.
      if (lag > LOOP_LAG_MS) {
        schedule(HOVER_CHECK_SLOW_MS);
        return;
      }

      if (!insideRef.current) {
        schedule(HOVER_CHECK_IDLE_MS);
        return;
      }

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
          schedule(HOVER_CHECK_IDLE_MS);
          return;
        }

        // Keep a slow pulse only while truly inside, to recover missed events.
        const now = Date.now();
        if (now - lastHidePulseAtRef.current >= HIDE_PULSE_MS) {
          emitHide();
        }
      } catch {
        // best effort
      }

      schedule(HOVER_CHECK_MS);
    };

    schedule(HOVER_CHECK_IDLE_MS);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
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

import { emitTo } from "@tauri-apps/api/event";

export function HoverZone() {
  return (
    <div
      className="hover-zone"
      onMouseEnter={() => {
        emitTo("main", "overlay-reactivate").catch(() => undefined);
      }}
    />
  );
}

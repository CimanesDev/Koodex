import { useEffect, useRef, useState } from "react";
import { priority } from "../../shared/format";
import type { UsageWindow } from "../../shared/types";
export function useAlternatingMetric(
  windows: UsageWindow[],
  interval = 3000,
  paused = false,
) {
  const [selected, setSelected] = useState<string>();
  const [restart, setRestart] = useState(0);
  const latest = useRef(windows);
  latest.current = windows;
  const membership = windows
    .map((w) => w.id)
    .sort()
    .join("|");
  const current =
    windows.find((w) => w.id === selected) ?? priority(windows)[0];
  const currentId = useRef(current?.id);
  currentId.current = current?.id;
  // Refreshes and popup focus must not reset the selected quota.
  useEffect(() => {
    if (current) setSelected(current.id);
  }, [membership]);
  function advance() {
    const items = latest.current;
    if (items.length < 2) return;
    const index = items.findIndex((w) => w.id === currentId.current);
    const next = items[(index + 1) % items.length].id;
    currentId.current = next;
    setSelected(next);
  }
  useEffect(() => {
    if (paused || interval === 0 || windows.length < 2) return;
    const timer = setInterval(advance, interval);
    return () => clearInterval(timer);
  }, [membership, interval, paused, restart]);
  return {
    quota: current,
    next: () => {
      advance();
      setRestart((n) => n + 1);
    },
  };
}

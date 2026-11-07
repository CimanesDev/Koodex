import { useEffect, useState } from "react";
import type { Snapshot } from "../../shared/types";

/** Every provider currently shown, primary first (one entry unless "Both"). */
export function useShownUsage() {
  const [shown, setShown] = useState<Snapshot[]>([]);
  useEffect(() => {
    let alive = true,
      received = false;
    const off = window.Koodex.onShownUsage((s) => {
      received = true;
      setShown(s);
    });
    void window.Koodex.getShownUsage().then((s) => {
      if (alive && !received) setShown(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return shown;
}

import { useEffect, useState } from "react";
import type { Snapshot } from "../../shared/types";
export function useUsage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    usage: null,
    syncState: "connecting",
  });
  useEffect(() => {
    let alive = true;
    let received = false;
    const off = window.Koodex.onUsageUpdated((s) => {
      received = true;
      setSnapshot(s);
    });
    void window.Koodex.getUsage().then((s) => {
      if (alive && !received) setSnapshot(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return {
    ...snapshot,
    lastUpdated: snapshot.usage?.fetchedAt,
    refresh: () => window.Koodex.refreshUsage(),
  };
}

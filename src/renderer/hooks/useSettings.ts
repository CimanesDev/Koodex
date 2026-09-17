import { useEffect, useState } from "react";
import { defaults, type Settings } from "../../shared/types";
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaults);
  useEffect(() => {
    let active = true,
      received = false;
    const off = window.Koodex.onSettingsUpdated((s) => {
      received = true;
      setSettings(s);
    });
    void window.Koodex.getSettings().then((s) => {
      if (active && !received) setSettings(s);
    });
    return () => {
      active = false;
      off();
    };
  }, []);
  return settings;
}

import { useEffect, useRef, useState } from "react";
import { useUsage } from "./hooks/useUsage";
import { CompactPill } from "./components/CompactPill";
import { ExpandedPopover } from "./components/ExpandedPopover";
import { SettingsView } from "./components/SettingsView";
import { useSettings } from "./hooks/useSettings";
export function App() {
  const state = useUsage();
  const settings = useSettings();
  const pill = new URLSearchParams(location.search).get("view") === "pill";
  const preferences =
    new URLSearchParams(location.search).get("view") === "settings";
  const [view, setView] = useState("usage");
  const [now, setNow] = useState(Date.now());
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => window.Koodex.onView(setView), []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 15000);
    const visible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape")
        void (preferences
          ? window.Koodex.closeSettings()
          : window.Koodex.hidePopover());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preferences]);
  useEffect(() => {
    if (pill || preferences || !root.current) return;
    const observer = new ResizeObserver(
      (entries) =>
        void window.Koodex.resizePopover(entries[0].contentRect.height),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [pill, preferences]);
  return (
    <div ref={root} data-accent={settings.accentColor}>
      {pill ? (
        <CompactPill
          state={state}
          paused={view === "paused"}
          settings={settings}
          now={now}
        />
      ) : preferences ? (
        <SettingsView settings={settings} now={now} />
      ) : (
        <ExpandedPopover state={state} now={now} refresh={state.refresh} />
      )}
    </div>
  );
}

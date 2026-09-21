import { useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { CompactPill } from "../renderer/components/CompactPill";
import { defaults, type Settings, type Snapshot } from "../shared/types";
import { pillSize } from "../shared/pill";
import "../renderer/styles/globals.css";
import "../renderer/styles/placement.css";
import "../renderer/styles/dual.css";
import "./preview.css";
const initial: Settings = {
  ...defaults,
  pillLayout: "both",
  pillIndicator: "bar",
  pillShowReset: true,
};
const colors = {
  neutral: "#eee",
  blue: "#8bbcff",
  mint: "#8ed8b8",
  lavender: "#bca5ee",
  rose: "#e5a4b8",
};
const now = Date.now();
const sample: Snapshot = {
  syncState: "synced",
  usage: {
    fetchedAt: now,
    windows: [
      {
        id: "five-hour",
        label: "5-hour",
        usedPercent: 32,
        remainingPercent: 68,
        resetsAt: now + 8280000,
        windowMinutes: 300,
      },
      {
        id: "weekly",
        label: "Weekly",
        usedPercent: 58,
        remainingPercent: 42,
        resetsAt: now + 309600000,
        windowMinutes: 10080,
      },
    ],
  },
};
function Preview() {
  const [s, set] = useState(initial);
  const update = (p: Partial<Settings>) => set((v) => ({ ...v, ...p }));
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const size = pillSize(s),
    scale = Math.min(1, (width - 80) / size.width, 130 / size.height);
  function choice(key: keyof Settings, label: string, options: string[][]) {
    return (
      <label>
        {label}
        <select
          aria-label={label}
          value={String(s[key])}
          onChange={(e) =>
            update({
              [key]: e.target.value,
              ...(key === "pillLayout"
                ? { pillBothStyle: "separate" as const }
                : {}),
            })
          }
        >
          {options.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <main
      className="demo"
      style={{ "--progress": colors[s.accentColor] } as CSSProperties}
    >
      <header>
        <div>
          <p>MAKE IT YOURS</p>
          <h1>Choose your view.</h1>
        </div>
        <button onClick={() => set(initial)}>Reset</button>
      </header>
      <section
        className={"stage position-" + s.pillPlacement}
        aria-label="Sample pill preview"
      >
        <div className="caption">
          YOUR FLOATING PILL <span>Sample usage</span>
        </div>
        <div style={{ width: size.width * scale, height: size.height * scale }}>
          <div
            style={{
              width: size.width,
              height: size.height,
              transform: "scale(" + scale + ")",
              transformOrigin: "top left",
            }}
          >
            <CompactPill
              state={sample}
              settings={s}
              now={now}
              paused={false}
              preview
            />
          </div>
        </div>
        <p>
          {s.pillLayout === "alternating"
            ? "Click the pill to switch limits."
            : s.pillBothStyle === "combined"
              ? s.pillIndicator === "ring"
                ? "5-hour outside. Weekly inside."
                : "5-hour first. Weekly second."
              : "Both limits, always in view."}
        </p>
      </section>
      <div className="controls">
        {choice("pillLayout", "Display", [
          ["both", "Both limits"],
          ["alternating", "One limit · click to switch"],
        ])}
        {choice("pillContent", "Contents", [
          ["details", "Text + indicator"],
          ["indicator", "Indicator only"],
        ])}
        <label>
          Progress style
          <select
            aria-label="Progress style"
            value={s.pillIndicator + "-" + s.pillBothStyle}
            onChange={(e) => {
              const [i, b] = e.target.value.split("-");
              update({
                pillIndicator: i as Settings["pillIndicator"],
                pillBothStyle: b as Settings["pillBothStyle"],
              });
            }}
          >
            <option value="bar-separate">
              {s.pillLayout === "both" ? "Two bars" : "Bar"}
            </option>
            <option value="ring-separate">
              {s.pillLayout === "both" ? "Two rings" : "Ring"}
            </option>
            {s.pillLayout === "both" && (
              <>
                <option value="bar-combined">Stacked bars</option>
                <option value="ring-combined">Nested rings</option>
              </>
            )}
          </select>
        </label>
        {choice("pillPlacement", "Placement", [
          ["free", "Free position"],
          ["top-left", "Top left"],
          ["top-center", "Top center"],
          ["top-right", "Top right"],
          ["left", "Left side · vertical"],
          ["right", "Right side · vertical"],
        ])}
      </div>
      <fieldset>
        <legend>Accent color</legend>
        {Object.entries(colors).map(([name, color]) => (
          <button
            key={name}
            aria-label={name}
            aria-pressed={s.accentColor === name}
            style={{ "--swatch": color } as CSSProperties}
            onClick={() =>
              update({ accentColor: name as Settings["accentColor"] })
            }
          />
        ))}
      </fieldset>
      <div className="toggles">
        {(
          [
            ["pillShowReset", "Reset countdown"],
            ["pillShowDragHandle", "Drag handle"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={s[key]}
              disabled={
                key === "pillShowReset" && s.pillContent === "indicator"
              }
              onChange={(e) => update({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="note">Try your style here. Make it yours in the app.</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);

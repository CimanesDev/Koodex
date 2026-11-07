import { useState } from "react";
import { providerName, type Provider, type Settings } from "../../shared/types";
import { ProviderLogo } from "./ProviderLogo";

export type ProviderView = Provider | "both";

export const viewOf = (s: Pick<Settings, "provider" | "showBothProviders">): ProviderView =>
  s.showBothProviders ? "both" : s.provider;

export const patchFor = (view: ProviderView): Partial<Settings> =>
  view === "both"
    ? { showBothProviders: true }
    : { provider: view, showBothProviders: false };

const views: ProviderView[] = ["codex", "claude", "both"];

/** Codex, Claude Code or both; switching is instant and shows the last known usage. */
export function ProviderSwitch({
  value,
  compact = false,
  onChange,
}: {
  value: ProviderView;
  compact?: boolean;
  onChange?: (view: ProviderView) => void;
}) {
  const [pending, setPending] = useState<ProviderView>();
  const current = pending ?? value;
  return (
    <div
      className={`provider-switch ${compact ? "provider-switch-compact" : ""}`}
      role="radiogroup"
      aria-label="Show usage for"
    >
      {views.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={current === v}
          title={v === "both" ? "Codex and Claude Code" : providerName(v)}
          onClick={async () => {
            if (v === value) return;
            setPending(v);
            try {
              if (onChange) onChange(v);
              else await window.Koodex.updateSettings(patchFor(v));
            } finally {
              setPending(undefined);
            }
          }}
        >
          {v === "both" ? (
            <span className="logo-pair" aria-hidden="true">
              <ProviderLogo provider="codex" size={12} />
              <ProviderLogo provider="claude" size={12} />
            </span>
          ) : (
            <ProviderLogo provider={v} size={13} />
          )}
          <span>
            {v === "both" ? "Both" : compact && v === "claude" ? "Claude" : providerName(v)}
          </span>
        </button>
      ))}
    </div>
  );
}

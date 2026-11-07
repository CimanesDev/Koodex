import { useState } from "react";
import { providerName, type Provider } from "../../shared/types";

const providers: Provider[] = ["codex", "claude"];

/** One provider at a time; switching is instant and shows the last known usage. */
export function ProviderSwitch({
  value,
  compact = false,
  onChange,
}: {
  value: Provider;
  compact?: boolean;
  onChange?: (provider: Provider) => void;
}) {
  const [pending, setPending] = useState<Provider>();
  const current = pending ?? value;
  return (
    <div
      className={`provider-switch ${compact ? "provider-switch-compact" : ""}`}
      role="radiogroup"
      aria-label="Provider"
    >
      {providers.map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={current === p}
          onClick={async () => {
            if (p === value) return;
            setPending(p);
            try {
              if (onChange) onChange(p);
              else await window.Koodex.updateSettings({ provider: p });
            } finally {
              setPending(undefined);
            }
          }}
        >
          {compact && p === "claude" ? "Claude" : providerName(p)}
        </button>
      ))}
    </div>
  );
}

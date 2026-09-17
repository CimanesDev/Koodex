export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="10" stroke="#ededed" strokeWidth="3" />
    </svg>
  );
}
export function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 8a6.2 6.2 0 10.1 4M16 3v5h-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function TraySymbol({ style }: { style: "meter" | "logo" | "ring" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      aria-hidden="true"
    >
      {style === "meter" ? (
        <>
          <path
            d="M3 8h18M3 16h18"
            stroke="currentColor"
            strokeOpacity=".25"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M3 8h13M3 16h8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : style === "logo" ? (
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" />
      ) : (
        <>
          <circle
            cx="12"
            cy="12"
            r="8"
            stroke="currentColor"
            strokeOpacity=".25"
            strokeWidth="2.5"
          />
          <path
            d="M12 4a8 8 0 11-8 8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle
            cx="12"
            cy="12"
            r="4"
            stroke="currentColor"
            strokeOpacity=".25"
            strokeWidth="2"
          />
          <path
            d="M12 8a4 4 0 014 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

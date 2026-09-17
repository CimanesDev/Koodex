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
export function TraySymbol({ style }: { style: "meter" | "ring" }) {
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

export function PillStyleSymbol({
  indicator,
  combined,
  both,
  vertical,
}: {
  indicator: "ring" | "bar";
  combined: boolean;
  both: boolean;
  vertical: boolean;
}) {
  return (
    <svg
      viewBox="0 0 80 40"
      width="80"
      height="40"
      fill="none"
      aria-hidden="true"
      className="pill-style-symbol"
    >
      {indicator === "ring" ? (
        combined && both ? (
          <>
            <circle
              cx="40"
              cy="20"
              r="15"
              stroke="currentColor"
              strokeWidth="3"
              opacity=".25"
            />
            <circle
              cx="40"
              cy="20"
              r="8"
              stroke="currentColor"
              strokeWidth="3"
              opacity=".25"
            />
            <path
              d="M40 5a15 15 0 1 1-15 15M40 12a8 8 0 0 1 8 8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            {(both ? [23, 57] : [40]).map((x) => (
              <g key={x}>
                <circle
                  cx={x}
                  cy="20"
                  r="12"
                  stroke="currentColor"
                  strokeWidth="3"
                  opacity=".25"
                />
                <circle
                  cx={x}
                  cy="20"
                  r="12"
                  stroke="currentColor"
                  strokeWidth="3"
                  pathLength="100"
                  strokeDasharray="65 100"
                  transform={`rotate(-90 ${x} 20)`}
                />
              </g>
            ))}
          </>
        )
      ) : combined && both ? (
        <g>
          <path
            d={vertical ? "M34 5v30M46 5v30" : "M15 14h50M15 26h50"}
            stroke="currentColor"
            opacity=".25"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d={vertical ? "M34 35v-21M46 35v-13" : "M15 14h35M15 26h22"}
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <>
          {(both ? [7, 45] : [15]).map((x) => (
            <g key={x}>
              <path
                d={`M${x} 20h${both ? 28 : 50}`}
                stroke="currentColor"
                opacity=".25"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d={`M${x} 20h${both ? 18 : 35}`}
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

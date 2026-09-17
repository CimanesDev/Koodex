import type { Settings } from "./types";
export const isVertical = (settings: Settings) =>
  settings.pillPlacement === "left" || settings.pillPlacement === "right";
export const hasGrip = (settings: Settings) =>
  settings.pillPlacement === "free" && settings.pillShowDragHandle;
export function pillSize(settings: Settings) {
  const both = settings.pillLayout === "both",
    minimal = settings.pillContent === "indicator",
    vertical = isVertical(settings),
    grip = hasGrip(settings) ? 20 : 0,
    refresh = settings.pillShowRefresh ? 32 : 0;
  if (both && settings.pillBothStyle === "combined") {
    if (minimal)
      return vertical
        ? {
            width: settings.pillIndicator === "ring" ? 44 : 104,
            height: 44 + refresh,
          }
        : {
            width:
              (settings.pillIndicator === "ring" ? 44 : 104) + grip + refresh,
            height: 44,
          };
    return vertical
      ? {
          width: 142,
          height: 112 + (settings.pillShowReset ? 32 : 0) + refresh,
        }
      : {
          width: 224 + (hasGrip(settings) ? 0 : -12) + refresh,
          height: 64 + (settings.pillShowReset ? 26 : 0),
        };
  }
  if (minimal) {
    if (vertical)
      return {
        width: settings.pillIndicator === "ring" ? 44 : 36,
        height:
          (settings.pillIndicator === "ring" ? (both ? 80 : 44) : 112) +
          refresh,
      };
    return {
      width:
        (settings.pillIndicator === "ring"
          ? both
            ? 80
            : 44
          : both
            ? 172
            : 104) +
        grip +
        refresh,
      height: 40,
    };
  }
  if (vertical)
    return {
      width: 132,
      height:
        (both ? 152 : 84) +
        (settings.pillShowReset ? (both ? 32 : 16) : 0) +
        refresh,
    };
  return {
    width:
      (both ? 284 : 204) +
      (settings.pillShowRefresh ? 32 : 0) -
      (hasGrip(settings) ? 0 : 12),
    height:
      (settings.pillIndicator === "bar" ? 50 : 44) +
      (settings.pillShowReset ? 18 : 0),
  };
}
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function pinnedPosition(settings: Settings, area: WorkArea) {
  const { width, height } = pillSize(settings),
    gap = 12;
  const left = area.x + gap,
    right = area.x + area.width - width - gap,
    top = area.y + gap;
  switch (settings.pillPlacement) {
    case "top-left":
      return { x: left, y: top };
    case "top-center":
      return { x: Math.round(area.x + (area.width - width) / 2), y: top };
    case "top-right":
      return { x: right, y: top };
    case "left":
      return { x: left, y: Math.round(area.y + (area.height - height) / 2) };
    case "right":
      return { x: right, y: Math.round(area.y + (area.height - height) / 2) };
    default:
      return (
        settings.pillPosition ?? {
          x: area.x + area.width - width - 20,
          y: area.y + area.height - height - 20,
        }
      );
  }
}

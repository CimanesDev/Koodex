import type { Settings } from "./types";
export const isVertical = (settings: Settings) =>
  settings.pillPlacement === "left" || settings.pillPlacement === "right";
export const hasGrip = (settings: Settings) => settings.pillShowDragHandle;
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
            width: settings.pillIndicator === "ring" ? 44 : 36,
            height:
              (settings.pillIndicator === "ring" ? 44 : 112) + grip + refresh,
          }
        : {
            width:
              (settings.pillIndicator === "ring" ? 44 : 104) + grip + refresh,
            height: 44,
          };
    return vertical
      ? {
          width: 142,
          height:
            (settings.pillIndicator === "ring" ? 112 : 160) +
            (settings.pillShowReset ? 32 : 0) +
            grip +
            refresh,
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
          grip +
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
        grip +
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
  if (settings.pillPlacement !== "free" && settings.pillPinOffset !== null) {
    return isVertical(settings)
      ? {
          x: settings.pillPlacement === "left" ? left : right,
          y: Math.round(
            top +
              Math.max(0, area.height - height - gap * 2) *
                settings.pillPinOffset,
          ),
        }
      : {
          x: Math.round(
            left +
              Math.max(0, area.width - width - gap * 2) *
                settings.pillPinOffset,
          ),
          y: top,
        };
  }
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

export function pinOffsetForDrag(
  settings: Settings,
  point: { x: number; y: number },
  area: WorkArea,
) {
  const size = pillSize(settings),
    vertical = isVertical(settings);
  const distance = vertical ? point.y - area.y - 12 : point.x - area.x - 12;
  const length = vertical
    ? area.height - size.height - 24
    : area.width - size.width - 24;
  return Math.max(0, Math.min(1, distance / Math.max(1, length)));
}

import type { Settings } from "./types";
export const DOCK_TAB_WIDTH = 32;
export const isVertical = (settings: Settings) =>
  settings.pillPlacement === "left" || settings.pillPlacement === "right";
export const hasGrip = (settings: Settings) => settings.pillShowDragHandle;
export function pillSize(settings: Settings) {
  const both = settings.pillLayout === "both",
    minimal = settings.pillContent === "indicator",
    vertical = isVertical(settings),
    combined = both && settings.pillBothStyle === "combined",
    ring = settings.pillIndicator === "ring",
    grip = hasGrip(settings) ? (vertical ? 16 : 20) : 0,
    refresh = settings.pillShowRefresh ? 32 : 0;
  if (vertical) {
    if (minimal)
      return {
        width: ring ? 40 : 36,
        height: (ring ? (both && !combined ? 72 : 40) : 64) + grip + refresh,
      };
    return {
      width: combined ? 144 : 132,
      height:
        (both ? 88 : 48) +
        (settings.pillShowReset ? (both ? 28 : 14) : 0) +
        grip +
        refresh,
    };
  }
  if (combined) {
    if (minimal)
      return { width: (ring ? 44 : 104) + grip + refresh, height: 44 };
    return {
      width: 224 + (hasGrip(settings) ? 0 : -12) + refresh,
      height: 64 + (settings.pillShowReset ? 26 : 0),
    };
  }
  if (minimal)
    return {
      width: (ring ? (both ? 80 : 44) : both ? 172 : 104) + grip + refresh,
      height: 40,
    };
  return {
    width: (both ? 284 : 176) + refresh - (hasGrip(settings) ? 0 : 12),
    height: (ring ? 44 : 50) + (settings.pillShowReset ? 18 : 0),
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

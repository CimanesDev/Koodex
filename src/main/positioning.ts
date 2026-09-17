export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function clampBounds(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.round(
      Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
    ),
  };
}
export function nearAnchor(
  anchor: Rect,
  width: number,
  height: number,
  area: Rect,
): Rect {
  const below = anchor.y + anchor.height + 8;
  return clampBounds(
    {
      x: anchor.x + anchor.width - width,
      y: below + height <= area.y + area.height ? below : anchor.y - height - 8,
      width,
      height,
    },
    area,
  );
}

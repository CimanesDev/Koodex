export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function snapBounds(rect: Rect, area: Rect): Rect {
  const result = clampBounds(rect, area);
  const gap = 12,
    distance = 32;
  const left = area.x + gap,
    right = area.x + area.width - rect.width - gap;
  const top = area.y + gap;
  if (Math.abs(result.x - left) <= distance) result.x = left;
  else if (Math.abs(result.x - right) <= distance) result.x = right;
  if (Math.abs(result.y - top) <= distance) {
    result.y = top;
    const center = Math.round(area.x + (area.width - rect.width) / 2);
    if (Math.abs(result.x - center) <= 64) result.x = center;
  }
  return clampBounds(result, area);
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

import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
function segment(x, y, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
    );
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function rounded(x, y, left, top, width, height, r) {
  const dx = Math.abs(x - left - width / 2) - width / 2 + r,
    dy = Math.abs(y - top - height / 2) - height / 2 + r;
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
      Math.min(Math.max(dx, dy), 0) <=
    r
  );
}
function image(size, style, color, amount = 7, app = false, weekly = 4) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = (x + (sx + 0.5) / 4) / size,
            py = (y + (sy + 0.5) / 4) / size;
          let c = [0, 0, 0, 0];
          if (app && rounded(px, py, 0.03, 0.03, 0.94, 0.94, 0.25))
            c = [19, 21, 22, 255];
          if (style === "logo") {
            const distance = Math.hypot(px - 0.5, py - 0.5);
            if (Math.abs(distance - (app ? 0.3 : 0.36)) < (app ? 0.041 : 0.06))
              c = [...color, 255];
          } else if (style === "meter") {
            for (const [level, top] of [
              [amount, 0.26],
              [weekly, 0.61],
            ]) {
              if (level < 0 && !(amount < 0 && weekly < 0)) continue;
              if (rounded(px, py, 0.1, top, 0.8, 0.14, 0.04))
                c = [...color, 65];
              if (
                level > 0 &&
                rounded(px, py, 0.1, top, (0.8 * level) / 10, 0.14, 0.04)
              )
                c = [...color, 255];
            }
          } else {
            const d = Math.hypot(px - 0.5, py - 0.5),
              angle =
                (Math.atan2(py - 0.5, px - 0.5) + Math.PI * 2.5) %
                (Math.PI * 2);
            if ((amount >= 0 || weekly < 0) && d > 0.355 && d < 0.455)
              c = [...color, angle < (Math.PI * 2 * amount) / 10 ? 255 : 55];
            if ((weekly >= 0 || amount < 0) && d > 0.17 && d < 0.27)
              c = [...color, angle < (Math.PI * 2 * weekly) / 10 ? 255 : 55];
          }
          for (let i = 0; i < 4; i++) sum[i] += c[i];
        }
      const offset = (y * size + x) * 4;
      for (let i = 0; i < 4; i++)
        png.data[offset + i] = Math.round(sum[i] / 16);
    }
  return PNG.sync.write(png);
}
mkdirSync("assets/tray", { recursive: true });
mkdirSync("assets/icons", { recursive: true });
for (const [theme, color] of [
  ["light", [242, 246, 244]],
  ["dark", [30, 36, 33]],
]) {
  writeFileSync(`assets/tray/${theme}-logo.png`, image(20, "logo", color));
  for (const style of ["meter", "ring"])
    for (let amount = -1; amount <= 10; amount++)
      for (let weekly = -1; weekly <= 10; weekly++)
        writeFileSync(
          `assets/tray/${theme}-${style}-dual-${amount}-${weekly}.png`,
          image(20, style, color, amount, false, weekly),
        );
}
const sizes = [16, 20, 32, 48, 64, 128, 256],
  images = sizes.map((s) => image(s, "logo", [238, 238, 238], 10, true));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header[at] = size === 256 ? 0 : size;
  header[at + 1] = header[at];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
writeFileSync("assets/icons/koodex.ico", Buffer.concat([header, ...images]));
writeFileSync("assets/icons/koodex.png", images.at(-1));

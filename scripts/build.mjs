import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["src/main/main.ts", "src/preload/preload.ts"],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  minify: true,
});
await viteBuild();

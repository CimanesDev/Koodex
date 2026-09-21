import { build } from "esbuild";
await build({
  entryPoints: ["src/site/preview.tsx"],
  bundle: true,
  minify: true,
  outfile: "docs/site-assets/preview.js",
  define: { "process.env.NODE_ENV": '"production"' },
});

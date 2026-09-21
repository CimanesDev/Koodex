import { build } from "esbuild";
await build({
  entryPoints: ["src/site/preview.tsx"],
  bundle: true,
  minify: true,
  outfile: "docs/site-assets/preview.js",
  define: { "process.env.NODE_ENV": '"production"' },
});

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Change each URL when its contents change, including the nested preview page.
async function versionReferences(page, assets) {
  let html = await readFile(page, "utf8");
  for (const asset of assets) {
    const contents = await readFile("docs/" + asset);
    const version = createHash("sha256")
      .update(contents)
      .digest("hex")
      .slice(0, 12);
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp('((?:href|src)=")' + escaped + '(?:\\?v=[^"]*)?"', "g"),
      "$1" + asset + "?v=" + version + '"',
    );
  }
  await writeFile(page, html);
}
await versionReferences("docs/preview.html", [
  "site-assets/preview.css",
  "site-assets/preview.js",
]);
await versionReferences("docs/index.html", ["site.css", "preview.html"]);

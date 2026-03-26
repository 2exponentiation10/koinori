import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const rootDir = path.resolve(scriptsDir, "..");
const outputDir = path.join(rootDir, "dist", "public");
const production = process.env.NODE_ENV !== "development";

await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "client", "main.jsx")],
  outfile: path.join(outputDir, "public-app.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  jsx: "transform",
  minify: production,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
  },
});

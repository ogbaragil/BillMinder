import { cp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const out = "dist";
if (existsSync(out)) await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "_headers",
  "wrangler.toml",
  "README.md",
  "supabase",
  "icons"
];

for (const file of files) {
  if (existsSync(file)) await cp(file, `${out}/${file}`, { recursive: true });
}

const config = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || ""
};

await writeFile(
  `${out}/config.js`,
  `window.__BILLMINDER_CONFIG__ = ${JSON.stringify(config)};\n`,
  "utf8"
);

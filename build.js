import esbuild from "esbuild";
import { minify } from "terser";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const checkABTestsAndTrackingUrl =
  process.env.CHECK_AB_TESTS_AND_TRACKING_URL ??
  "https://app.stracked.com.br/api/check-ab-test-and-tracking";

const trackingUrl =
  process.env.TRACKING_URL ?? "wss://app.stracked.com.br/tracking";

const outDir = path.resolve("public");
const outFile = path.join(outDir, "loader.js");

function fmtBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`;
  } catch {
    return u;
  }
}

async function build() {
  const t0 = Date.now();

  console.log("== Stracked CDN Build ==");
  console.log(`Entry: src/loader.ts`);
  console.log(`Output dir: ${outDir}`);
  console.log(`Output file: ${outFile}`);
  console.log(`CHECK_AB_TESTS_AND_TRACKING_URL: ${safeUrl(checkABTestsAndTrackingUrl)}`);
  console.log(`TRACKING_URL: ${safeUrl(trackingUrl)}`);
  console.log("");

  console.log("[1/4] Bundling (esbuild)...");
  const t1 = Date.now();

  const result = await esbuild.build({
    entryPoints: ["src/loader.ts"],
    bundle: true,
    minify: false,
    target: "es2020",
    treeShaking: true,
    format: "esm",
    platform: "browser",
    write: false,
    legalComments: "none",
    define: {
      "process.env.CHECK_AB_TESTS_AND_TRACKING_URL": JSON.stringify(checkABTestsAndTrackingUrl),
      "process.env.TRACKING_URL": JSON.stringify(trackingUrl),
    },
  });

  const bundled = result.outputFiles[0].text;
  console.log(
    `     done in ${fmtMs(Date.now() - t1)} | bundle size: ${fmtBytes(Buffer.byteLength(bundled, "utf8"))}`
  );

  console.log("[2/4] Minifying (terser)...");
  const t2 = Date.now();

  const minified = await minify(bundled, {
    compress: {
      passes: 4,
      booleans_as_integers: true,
      arguments: true,
      drop_console: true,
      hoist_funs: true,
    },
    ecma: 2020,
    toplevel: true,
    module: true,
    mangle: true,
  });

  if (!minified.code) {
    throw new Error("Terser failed to output code.");
  }

  const out = minified.code;
  const before = Buffer.byteLength(bundled, "utf8");
  const after = Buffer.byteLength(out, "utf8");
  const ratio = before > 0 ? after / before : 1;

  console.log(
    `     done in ${fmtMs(Date.now() - t2)} | min size: ${fmtBytes(after)} | ratio: ${(ratio * 100).toFixed(1)}%`
  );

  console.log("[3/4] Ensuring public directory exists...");
  const t3 = Date.now();

  await mkdir(outDir, { recursive: true });

  console.log(`     done in ${fmtMs(Date.now() - t3)}`);

  console.log("[4/4] Writing public/loader.js...");
  const t4 = Date.now();

  await writeFile(outFile, out, "utf8");

  console.log(`     done in ${fmtMs(Date.now() - t4)}`);
  console.log("");
  console.log(`✅ Build complete: ${outFile} (${fmtBytes(after)}) in ${fmtMs(Date.now() - t0)}`);
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exitCode = 1;
});
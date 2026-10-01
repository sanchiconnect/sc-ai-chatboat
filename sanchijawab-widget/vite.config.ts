import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Single self-contained script (IIFE) — this is what customers paste into
// their site: <script src=".../widget.js" data-bot="..." async></script>.
// No code-splitting, no external chunks — everything customers load must
// be this one file.
export default defineConfig({
  plugins: [preact()],
  // Forces esbuild to keep non-ASCII characters (icons like the send arrow,
  // thumbs up/down) as \uXXXX escapes in the output instead of "optimizing"
  // them back into raw multi-byte UTF-8 bytes. Escapes are immune to a host
  // page's script/document charset; raw UTF-8 bytes are not — a customer
  // site without an explicit UTF-8 declaration (surprisingly common) would
  // otherwise mangle every icon into mojibake. See knowledge.md.
  esbuild: {
    charset: "ascii",
  },
  build: {
    lib: {
      entry: "src/main.tsx",
      formats: ["iife"],
      name: "SanchiJawabWidget",
      fileName: () => "widget.js",
    },
    cssCodeSplit: false,
    minify: true,
  },
});

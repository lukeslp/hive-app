import { mergeConfig } from "vite";
import path from "node:path";

import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
  base: "ideatiles://app/",
  build: {
    outDir: path.resolve(import.meta.dirname, "macos/Resources/WebApp"),
    emptyOutDir: true,
    sourcemap: "inline",
  },
});

import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      // Avoid resolving from a parent cwd when dev/build is launched outside this folder.
      base: projectRoot,
    },
  },
};

export default config;

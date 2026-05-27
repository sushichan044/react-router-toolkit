// @ts-check

// Standalone (non-bundled) child process entry. Invoked as `node eval-worker.mjs <root> <outFile>`
// by the lint rule to evaluate `<root>/app/routes.ts` and write the declared route module paths to
// `<outFile>` as JSON.
//
// The result is written to a file rather than stdout because evaluating the project loads its Vite
// config, whose plugins may print to stdout and corrupt a stdout-based JSON payload.
//
// Kept as plain ESM so it does not depend on the build tool's multi-entry support, and resolves
// `react-router-toolkit` (and its transitive `vite`) from the target project at runtime.
import { writeFileSync } from "node:fs";

import { buildRouteIndex, loadRouteTree } from "react-router-toolkit";

const root = process.argv[2];
const outFile = process.argv[3];
if (!root || !outFile) {
  process.stderr.write("eval-worker: missing <root> or <outFile> argument\n");
  process.exit(1);
}

const tree = await loadRouteTree({ root });

// Drops the synthesized `app/root.tsx` (id === "root"), leaving only paths declared in routes.ts.
const files = [
  ...new Set(
    [...buildRouteIndex(tree).values()]
      .filter((node) => node.id !== "root")
      .map((node) => node.file),
  ),
];

writeFileSync(outFile, JSON.stringify(files));

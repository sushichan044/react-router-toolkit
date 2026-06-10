#!/usr/bin/env node
import process from "node:process";

import { cli, define } from "gunshi";
import { resolve } from "pathe";

import { resolveReactRouterConfig } from "./resolve";
import { analyzeRouteModules } from "./route-module-info";
import { computeTypegenTargets } from "./typegen/compute";
import { createProjectFiles } from "./typegen/fs";
import { writeTypegenFiles } from "./typegen/write";

const typegen = define({
  name: "typegen",
  description:
    "Generate outlet-context type modules into .react-router-toolkit/types. " +
    "Run before type checking; route files import them as ./+toolkit-types/<route>.",
  args: {
    root: {
      type: "string",
      short: "r",
      default: ".",
      description: "Project root (the directory containing vite.config.*)",
    },
  },
  run: async (ctx) => {
    const root = resolve(ctx.values.root);
    const resolved = await resolveReactRouterConfig(root);
    const targets = computeTypegenTargets(root, await analyzeRouteModules(resolved));
    const result = await writeTypegenFiles(targets, createProjectFiles(root));

    for (const file of result.written) {
      console.log(`  generated ${file}`);
    }
    console.log(`typegen: ${result.written.length} files generated`);
  },
});

const main = define({
  name: "react-router-toolkit",
  description: "Toolkit CLI for React Router framework-mode projects",
  run: () => {
    console.log("Usage: react-router-toolkit <command>");
    console.log("");
    console.log("Commands:");
    console.log("  typegen  Generate outlet-context type modules");
  },
});

await cli(process.argv.slice(2), main, {
  name: "react-router-toolkit",
  subCommands: { typegen },
});

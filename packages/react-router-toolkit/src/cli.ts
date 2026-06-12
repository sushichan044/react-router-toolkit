#!/usr/bin/env node
import process from "node:process";

import { cli, define } from "gunshi";
import { resolve } from "pathe";

import { findOrphanRouteFiles } from "./orphan-routes";
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
    try {
      let resolved: Awaited<ReturnType<typeof resolveReactRouterConfig>>;
      try {
        resolved = await resolveReactRouterConfig(root);
      } catch (error) {
        throw new Error(
          `Failed to resolve React Router config at ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let routeModules: Awaited<ReturnType<typeof analyzeRouteModules>>;
      try {
        routeModules = await analyzeRouteModules(resolved);
      } catch (error) {
        throw new Error(
          `Failed to analyze route modules under ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let targets: ReturnType<typeof computeTypegenTargets>;
      try {
        targets = computeTypegenTargets(root, routeModules);
      } catch (error) {
        throw new Error(
          `Failed to compute typegen targets under ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let result: Awaited<ReturnType<typeof writeTypegenFiles>>;
      try {
        result = await writeTypegenFiles(targets, createProjectFiles(root));
      } catch (error) {
        throw new Error(
          `Failed to write typegen files under ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      for (const file of result.written) {
        console.log(`  generated ${file}`);
      }
      console.log(`typegen: ${result.written.length} files generated`);
    } catch (error) {
      console.error(`typegen failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  },
});

const checkOrphans = define({
  name: "check-orphans",
  description:
    "Report route module files inside the app directory that are not registered in routes.ts. " +
    "Exits with code 1 when orphan files are found.",
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
    try {
      let resolved: Awaited<ReturnType<typeof resolveReactRouterConfig>>;
      try {
        resolved = await resolveReactRouterConfig(root);
      } catch (error) {
        throw new Error(
          `Failed to resolve React Router config at ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let orphans: string[];
      try {
        orphans = await findOrphanRouteFiles(resolved.routes, resolved.appDirectory);
      } catch (error) {
        throw new Error(
          `Failed to scan for orphan route files under ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (orphans.length === 0) {
        console.log("No orphan route files found.");
        return;
      }

      console.error("Orphan route files found (not registered in routes.ts):");
      for (const file of orphans) {
        console.error(`  ${file}`);
      }
      process.exitCode = 1;
    } catch (error) {
      console.error(
        `check-orphans failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  },
});

const main = define({
  name: "react-router-toolkit",
  description: "Toolkit CLI for React Router framework-mode projects",
  run: () => {
    console.log("Usage: react-router-toolkit <command>");
    console.log("");
    console.log("Commands:");
    console.log("  typegen        Generate outlet-context type modules");
    console.log("  check-orphans  Report unregistered route module files");
  },
});

await cli(process.argv.slice(2), main, {
  name: "react-router-toolkit",
  subCommands: { typegen, "check-orphans": checkOrphans },
});

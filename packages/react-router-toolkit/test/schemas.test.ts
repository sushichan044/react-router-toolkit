import * as v from "valibot";
import { describe, expect, it as baseIt } from "vite-plus/test";

import { resolveReactRouterConfig } from "../src/index";
import { analyzeRouteModules } from "../src/route-module-info";
import { resolvedReactRouterConfigSchema, routeModuleInfoSchema } from "../src/schemas";
import { fixtureRoot } from "./fixture";
import { makeTempDir } from "./utils";

const it = baseIt.extend<{ cacheDir: string }>({
  cacheDir: async ({}, use) => {
    await using cacheDir = await makeTempDir(import.meta.filename);
    await use(cacheDir.path);
  },
});

describe("resolvedReactRouterConfigSchema", () => {
  it("parses a resolved config after a JSON round-trip", async ({ cacheDir }) => {
    const resolved = await resolveReactRouterConfig(fixtureRoot("minimal"), { cacheDir });
    const jsonSafe: unknown = JSON.parse(JSON.stringify(resolved));

    const parsed = v.parse(resolvedReactRouterConfigSchema, jsonSafe);

    expect(parsed.appDirectory).toBe(resolved.appDirectory);
    expect(Object.keys(parsed.routes).sort()).toEqual(["about", "home", "root"]);
    expect(parsed.serverModuleFormat).toBe("esm");
    expect(parsed.allowedActionOrigins).toBe(false);
  });

  it("accepts a config whose function-typed properties were dropped by JSON serialization", () => {
    const withFunctions = {
      appDirectory: "/project/app",
      basename: "/",
      buildDirectory: "/project/build",
      buildEnd: () => undefined,
      serverBundles: () => "bundle",
      prerender: () => ["/"],
      future: { v8_middleware: false },
      routeDiscovery: { mode: "initial" },
      routes: { root: { id: "root", file: "root.tsx" } },
      serverBuildFile: "index.js",
      serverModuleFormat: "cjs",
      ssr: false,
      subResourceIntegrity: true,
      allowedActionOrigins: ["https://example.com"],
    };
    const jsonSafe: unknown = JSON.parse(JSON.stringify(withFunctions));

    const parsed = v.parse(resolvedReactRouterConfigSchema, jsonSafe);

    expect(parsed).not.toHaveProperty("buildEnd");
    expect(parsed.allowedActionOrigins).toEqual(["https://example.com"]);
  });

  it("strips undeclared properties, including functions from a live config", () => {
    const live = {
      appDirectory: "/project/app",
      basename: "/",
      buildDirectory: "/project/build",
      future: { v8_middleware: false },
      routes: {},
      serverBuildFile: "index.js",
      serverModuleFormat: "esm",
      ssr: true,
      subResourceIntegrity: false,
      allowedActionOrigins: false,
      buildEnd: () => undefined,
      prerender: ["/about"],
      unstable_routeConfig: [],
    };

    const parsed = v.parse(resolvedReactRouterConfigSchema, live);

    expect(parsed).not.toHaveProperty("buildEnd");
    expect(parsed).not.toHaveProperty("prerender");
    expect(parsed).not.toHaveProperty("unstable_routeConfig");
    expect(parsed.future).toEqual({ v8_middleware: false });
  });

  it("rejects a config missing required JSON-safe properties", () => {
    expect(() => v.parse(resolvedReactRouterConfigSchema, { routes: {} })).toThrow();
  });
});

describe("routeModuleInfoSchema", () => {
  it("parses the output of analyzeRouteModules after a JSON round-trip", async ({ cacheDir }) => {
    const resolved = await resolveReactRouterConfig(fixtureRoot("minimal"), { cacheDir });
    const routeModules = await analyzeRouteModules(resolved);
    const jsonSafe: unknown = JSON.parse(JSON.stringify(routeModules));

    const parsed = v.parse(v.record(v.string(), routeModuleInfoSchema), jsonSafe);

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(routeModules).sort());
    expect(parsed["root"]?.exports.default).not.toBeNull();
  });
});

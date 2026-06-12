import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import validRouteFile from "./valid-route-file";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

function fixtureRoot(fixture: string): string {
  return fileURLToPath(new URL(`../../test/fixtures/${fixture}`, import.meta.url));
}

function fixtureRoutesFile(fixture: string): string {
  return join(fixtureRoot(fixture), "app", "routes.ts");
}

function readFixture(fixture: string): string {
  return readFileSync(fixtureRoutesFile(fixture), "utf8");
}

async function fixtureSettings(fixture: string): Promise<Settings> {
  await using cacheDir = await makeTempDir(import.meta.filename);
  const settings = await reactRouterToolkitSettings({
    root: fixtureRoot(fixture),
    cacheDir: cacheDir.path,
  });
  return settings as unknown as Settings;
}

describe("valid-route-file", () => {
  it("does not report when every declared route module exists", async () => {
    const settings = await fixtureSettings("valid");
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [
          {
            code: readFixture("valid"),
            filename: fixtureRoutesFile("valid"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports when the routes config file has no default export", async () => {
    const settings = await fixtureSettings("valid");
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [],
        invalid: [
          {
            code: 'import { index, route } from "@react-router/dev/routes";\n',
            filename: fixtureRoutesFile("valid"),
            settings,
            errors: [
              {
                messageId: "missingDefaultExport",
                line: 1,
                column: 0,
              },
            ],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports a missing route module on the export default declaration", async () => {
    const settings = await fixtureSettings("missing-file");
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [],
        invalid: [
          {
            code: readFixture("missing-file"),
            filename: fixtureRoutesFile("missing-file"),
            settings,
            errors: [
              {
                messageId: "missingRouteFile",
                line: 3,
                column: 0,
              },
            ],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports an orphan route file on the export default declaration", async () => {
    const settings = await fixtureSettings("with-orphan");
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [],
        invalid: [
          {
            code: readFixture("with-orphan"),
            filename: fixtureRoutesFile("with-orphan"),
            settings,
            errors: [
              {
                messageId: "orphanRouteFile",
                line: 3,
                column: 0,
              },
            ],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report when there are no orphan route files", async () => {
    const settings = await fixtureSettings("valid");
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [
          {
            code: readFixture("valid"),
            filename: fixtureRoutesFile("valid"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});

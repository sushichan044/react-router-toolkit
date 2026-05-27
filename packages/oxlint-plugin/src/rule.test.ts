import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import validRouteFile from "./rule";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

function fixtureRoutesFile(fixture: string): string {
  return fileURLToPath(new URL(`../test/fixtures/${fixture}/app/routes.ts`, import.meta.url));
}

function readFixture(fixture: string): string {
  return readFileSync(fixtureRoutesFile(fixture), "utf8");
}

describe("valid-route-file", () => {
  it("does not report when every declared route module exists", () => {
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [
          {
            code: readFixture("valid"),
            filename: fixtureRoutesFile("valid"),
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports a missing route module on its source literal", () => {
    expect(() => {
      ruleTester.run("valid-route-file", validRouteFile, {
        valid: [],
        invalid: [
          {
            code: readFixture("missing-file"),
            filename: fixtureRoutesFile("missing-file"),
            errors: [
              {
                messageId: "missingRouteFile",
                line: 3,
              },
            ],
          },
        ],
      });
    }).not.toThrow();
  });
});

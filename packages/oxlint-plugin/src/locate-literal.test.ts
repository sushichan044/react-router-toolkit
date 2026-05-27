import { resolve as resolvePath } from "node:path";

import type { ESTree } from "@oxlint/plugins";
import { describe, expect, it } from "vite-plus/test";

import type { FileLiteral } from "./locate-literal";
import { buildLiteralLocationMap, extractFileLiteral } from "./locate-literal";

function stringLiteral(value: string): ESTree.StringLiteral {
  return { type: "Literal", value, raw: JSON.stringify(value) } as ESTree.StringLiteral;
}

function call(calleeName: string, args: ESTree.Argument[]): ESTree.CallExpression {
  return {
    type: "CallExpression",
    callee: { type: "Identifier", name: calleeName } as ESTree.IdentifierReference,
    arguments: args,
    optional: false,
  } as ESTree.CallExpression;
}

describe("extractFileLiteral", () => {
  it("reads the file argument of index() at position 0", () => {
    const literal = extractFileLiteral(call("index", [stringLiteral("home.tsx")]));
    expect(literal?.value).toBe("home.tsx");
  });

  it("reads the file argument of route() at position 1", () => {
    const literal = extractFileLiteral(
      call("route", [stringLiteral("about"), stringLiteral("about.tsx")]),
    );
    expect(literal?.value).toBe("about.tsx");
  });

  it("reads the file argument of layout() at position 0", () => {
    const literal = extractFileLiteral(call("layout", [stringLiteral("shell.tsx")]));
    expect(literal?.value).toBe("shell.tsx");
  });

  it("ignores helpers without a file argument such as prefix()", () => {
    expect(extractFileLiteral(call("prefix", [stringLiteral("concerts")]))).toBeNull();
  });

  it("ignores a non-literal file argument", () => {
    const identifierArg = { type: "Identifier", name: "ABOUT_FILE" } as ESTree.IdentifierReference;
    expect(extractFileLiteral(call("route", [stringLiteral("about"), identifierArg]))).toBeNull();
  });
});

describe("buildLiteralLocationMap", () => {
  it("keys each literal by its path resolved against the app directory", () => {
    const literals: FileLiteral[] = [
      { value: "home.tsx", node: stringLiteral("home.tsx") },
      { value: "./about.tsx", node: stringLiteral("./about.tsx") },
    ];

    const map = buildLiteralLocationMap(literals, "/project/app");

    expect(map.has(resolvePath("/project/app", "home.tsx"))).toBe(true);
    // `./about.tsx` and the normalised `about.tsx` resolve to the same absolute path.
    expect(map.has(resolvePath("/project/app", "about.tsx"))).toBe(true);
  });
});

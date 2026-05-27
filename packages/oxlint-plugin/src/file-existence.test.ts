import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { createFileExistenceChecker } from "./file-existence";

describe("createFileExistenceChecker", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rrt-existence-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports existing and missing files", () => {
    writeFileSync(join(dir, "home.tsx"), "");
    const exists = createFileExistenceChecker();

    expect(exists(join(dir, "home.tsx"))).toBe(true);
    expect(exists(join(dir, "about.tsx"))).toBe(false);
  });

  it("re-reads a directory once a previously missing file is created", () => {
    const exists = createFileExistenceChecker();
    const target = join(dir, "about.tsx");

    expect(exists(target)).toBe(false);

    writeFileSync(target, "");

    expect(exists(target)).toBe(true);
  });

  it("returns false when the containing directory does not exist", () => {
    const exists = createFileExistenceChecker();

    expect(exists(join(dir, "nope", "home.tsx"))).toBe(false);
  });
});

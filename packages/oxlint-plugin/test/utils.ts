import { mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";

import { basename, join } from "pathe";

export function makeTempDir(importMetaFileName: string) {
  return mkdtempDisposable(join(tmpdir(), basename(importMetaFileName)));
}

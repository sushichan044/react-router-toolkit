import { create, RealFSProvider } from "@platformatic/vfs";
import type { VirtualFileSystem } from "@platformatic/vfs";

/**
 * Recursively enumerate files under `publicDir` and return their URL paths as a sorted array. Each
 * entry is a decoded, `/`-prefixed path relative to `publicDir` (e.g. `"/manual.pdf"` or `"/STORES
 * ロイヤリティ同意事項.pdf"`).
 *
 * Returns an empty array when `publicDir` does not exist.
 *
 * `files` is a filesystem rooted at `publicDir`, defaulting to the real one — pass a
 * `MemoryProvider`-backed VFS to test against in-memory sources.
 */
export async function listPublicAssets(
  publicDir: string,
  files: VirtualFileSystem = create(new RealFSProvider(publicDir), { moduleHooks: false }),
): Promise<string[]> {
  // Check if the publicDir exists; return empty if absent.
  try {
    await files.promises.stat("/");
  } catch {
    return [];
  }

  const results: string[] = [];
  await collectFiles(files, "/", results);
  return results.sort();
}

async function collectFiles(
  files: VirtualFileSystem,
  dir: string,
  results: string[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await files.promises.readdir(dir);
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = dir === "/" ? `/${entry}` : `${dir}/${entry}`;
      let stat;
      try {
        stat = await files.promises.stat(entryPath);
      } catch {
        return;
      }
      if (stat.isDirectory()) {
        await collectFiles(files, entryPath, results);
      } else if (stat.isFile()) {
        // Decode percent-encoded characters so the stored paths are human-readable
        // and match what browsers send in decoded form.
        try {
          results.push(decodeURI(entryPath));
        } catch {
          results.push(entryPath);
        }
      }
    }),
  );
}

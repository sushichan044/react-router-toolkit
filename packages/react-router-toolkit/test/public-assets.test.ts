import { create } from "@platformatic/vfs";
import { describe, expect, it } from "vite-plus/test";

import { listPublicAssets } from "../src/public-assets";

function makeVfs(entries: Record<string, string>): ReturnType<typeof create> {
  const vfs = create({ moduleHooks: false });
  for (const [path, content] of Object.entries(entries)) {
    // Ensure parent directories exist
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const dir = "/" + parts.slice(0, i).join("/");
      try {
        vfs.mkdirSync(dir);
      } catch {
        // Already exists — ignore
      }
    }
    vfs.writeFileSync(path, content);
  }
  return vfs;
}

describe("listPublicAssets", () => {
  it("returns an empty array when publicDir does not exist", async () => {
    // Use the real FS with a path that cannot exist — no VFS needed here.
    const result = await listPublicAssets("/nonexistent/path/that/does/not/exist/ever");
    expect(result).toStrictEqual([]);
  });

  it("lists files at the root of publicDir as /-prefixed decoded paths", async () => {
    const vfs = makeVfs({
      "/manual.pdf": "",
      "/logo.png": "",
    });

    const result = await listPublicAssets("/public", vfs);
    expect(result).toStrictEqual(["/logo.png", "/manual.pdf"]);
  });

  it("recursively lists files in nested directories", async () => {
    const vfs = makeVfs({
      "/docs/guide.pdf": "",
      "/docs/reference.pdf": "",
      "/images/hero.png": "",
      "/favicon.ico": "",
    });

    const result = await listPublicAssets("/public", vfs);
    expect(result).toStrictEqual([
      "/docs/guide.pdf",
      "/docs/reference.pdf",
      "/favicon.ico",
      "/images/hero.png",
    ]);
  });

  it("returns decoded paths for Japanese filenames", async () => {
    // Write the file with its real (decoded) name; listPublicAssets should return it decoded.
    const vfs = makeVfs({
      "/STORES ロイヤリティ同意事項.pdf": "",
    });

    const result = await listPublicAssets("/public", vfs);
    // The path stored by listPublicAssets is the decoded form (the on-disk name).
    expect(result).toStrictEqual(["/STORES ロイヤリティ同意事項.pdf"]);
  });

  it("returns the raw path when a filename cannot be decoded as a URI", async () => {
    const vfs = makeVfs({
      "/bad%zz.txt": "",
    });

    const result = await listPublicAssets("/public", vfs);
    expect(result).toStrictEqual(["/bad%zz.txt"]);
  });

  it("surfaces descendant traversal errors instead of returning partial results", async () => {
    const vfs = makeVfs({
      "/ok.txt": "",
      "/blocked/file.txt": "",
    });
    const originalReaddir = vfs.promises.readdir.bind(vfs.promises);
    const files = {
      ...vfs,
      promises: {
        ...vfs.promises,
        readdir: async (path: string) => {
          if (path === "/blocked") {
            throw Object.assign(new Error("permission denied"), { code: "EACCES" });
          }
          return originalReaddir(path);
        },
      },
    } as typeof vfs;

    await expect(listPublicAssets("/public", files)).rejects.toThrow("permission denied");
  });

  it("returns a sorted array regardless of filesystem order", async () => {
    const vfs = makeVfs({
      "/z.txt": "",
      "/a.txt": "",
      "/m.txt": "",
    });

    const result = await listPublicAssets("/public", vfs);
    expect(result).toStrictEqual(["/a.txt", "/m.txt", "/z.txt"]);
  });

  it("returns an empty array for an empty public directory", async () => {
    const vfs = create({ moduleHooks: false });
    // Root directory exists but has no files.
    const result = await listPublicAssets("/public", vfs);
    expect(result).toStrictEqual([]);
  });
});

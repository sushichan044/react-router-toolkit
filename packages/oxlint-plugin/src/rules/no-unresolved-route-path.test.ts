import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import noUnresolvedRoutePath from "./no-unresolved-route-path";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

const FIXTURE = "no-unresolved-route-path";

function fixtureRoot(): string {
  return fileURLToPath(new URL(`../../test/fixtures/${FIXTURE}`, import.meta.url));
}

function appFile(relative: string): string {
  return join(fixtureRoot(), "app", relative);
}

async function fixtureSettings(): Promise<Settings> {
  await using cacheDir = await makeTempDir(import.meta.filename);
  const settings = await reactRouterToolkitSettings({
    root: fixtureRoot(),
    cacheDir: cacheDir.path,
  });
  return settings as unknown as Settings;
}

describe("no-unresolved-route-path", () => {
  // -------------------------------------------------------------------------
  // navigate() — string literal
  // -------------------------------------------------------------------------

  it("does not report navigate() with a valid static path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/about");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports navigate() with an unresolved static path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `navigate("/nonexistent");`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report a local navigate helper that is not imported from React Router", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `function navigate(path: string) {
  return path;
}
navigate("/nonexistent");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports a useNavigate alias with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { useNavigate } from "react-router";
const go = useNavigate();
go("/nope");`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // redirect() — imported from react-router
  // -------------------------------------------------------------------------

  it("does not report redirect() with a valid path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `import { redirect } from "react-router";
export const loader = () => redirect("/about");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports redirect() with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { redirect } from "react-router";
export const loader = () => redirect("/nope");`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("handles redirect renamed on import", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { redirect as rr } from "react-router";
export const loader = () => rr("/nope");`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Template literals
  // -------------------------------------------------------------------------

  it("does not report template literal matching a dynamic route", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            // `/shops/${shopId}` → /shops/__dyn0__ → matches /shops/:shop_id
            code: "navigate(`/shops/${shopId}`);",
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports template literal that does not match any route", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: "navigate(`/nope/${id}`);",
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Skip conditions
  // -------------------------------------------------------------------------

  it("skips relative paths", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("../about");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("skips external https:// URLs", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `<a href="https://example.com/page">link</a>`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("skips protocol-relative URLs (//)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `<a href="//cdn.example.com/resource">link</a>`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("skips mailto: links", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `<a href="mailto:user@example.com">email</a>`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("skips paths matching the allowedPaths option", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/admin/dashboard");`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowedPaths: ["/admin"] }],
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports path not covered by allowedPaths", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `navigate("/nope");`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowedPaths: ["/admin"] }],
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Query string and hash
  // -------------------------------------------------------------------------

  it("matches valid path with query string", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/about?ref=home");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("matches valid path with hash", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/about#section");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // JSX components: <Link to>, <NavLink to>, <Form action>
  // -------------------------------------------------------------------------

  it("does not report <Link to> with a valid path (imported from react-router)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `import { Link } from "react-router";
export default function Nav() {
  return <Link to="/about">About</Link>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports <Link to> with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { Link } from "react-router";
export default function Nav() {
  return <Link to="/nope">Nope</Link>;
}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report a local <Link> component that is not imported from React Router", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `function Link({ to }: { to: string }) {
  return <span>{to}</span>;
}
export default function Nav() {
  return <Link to="/nope">Nope</Link>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report <NavLink to> with a valid path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `import { NavLink } from "react-router";
export default function Nav() {
  return <NavLink to="/about">About</NavLink>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports <NavLink to> with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { NavLink } from "react-router";
export default function Nav() {
  return <NavLink to="/nope">Nope</NavLink>;
}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report <Form action> with a valid path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `import { Form } from "react-router";
export default function Page() {
  return <Form action="/about">form</Form>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports <Form action> with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `import { Form } from "react-router";
export default function Page() {
  return <Form action="/nope">form</Form>;
}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report <a href> with a valid path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `export default function Page() {
  return <a href="/about">About</a>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports <a href> with an unresolved path", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `export default function Page() {
  return <a href="/nope">Nope</a>;
}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // index route
  // -------------------------------------------------------------------------

  it("does not report navigate('/') for the index route", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/");`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // No settings → no-op
  // -------------------------------------------------------------------------

  it("does not report anything when settings are absent", () => {
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `navigate("/nope");`,
            filename: appFile("home.tsx"),
            settings: {},
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // JSXExpressionContainer with template literal
  // -------------------------------------------------------------------------

  it("checks template literal inside JSX expression container for <Link to>", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: "import { Link } from 'react-router';\nexport default () => <Link to={`/shops/${id}`}>S</Link>;",
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Public assets — links to static files in the public directory
  // -------------------------------------------------------------------------

  it("does not report <a href> pointing to an existing public asset", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            code: `export default function Page() {
  return <a href="/manual.pdf">Download</a>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report <a href> with a URL-encoded Japanese filename that exists in public/", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [
          {
            // The file on disk is "STORES ロイヤリティ同意事項.pdf"; the href is URL-encoded.
            code: `export default function Page() {
  return <a href="/STORES%20%E3%83%AD%E3%82%A4%E3%83%A4%E3%83%AA%E3%83%86%E3%82%A3%E5%90%8C%E6%84%8F%E4%BA%8B%E9%A0%85.pdf">Terms</a>;
}`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports <a href> pointing to a path that is not a route and not a public asset", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unresolved-route-path", noUnresolvedRoutePath, {
        valid: [],
        invalid: [
          {
            code: `export default function Page() {
  return <a href="/nonexistent-asset.pdf">Bad</a>;
}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unresolvedRoutePath" }],
          },
        ],
      });
    }).not.toThrow();
  });
});

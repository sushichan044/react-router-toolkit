import { index, route, type RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

// Hand-written routing that mirrors the filesystem-based routing under `app/routes/`.
const manual: RouteConfig = [index("routes/_index.tsx"), route("hello", "routes/hello.tsx")];

// Switch routings from a single file via a `define`-replaced `import.meta` flag, so a snapshot
// test can evaluate both branches and assert they expose the same URLs and layouts.
export default import.meta.env.RR_USE_FS_ROUTES ? flatRoutes() : manual;

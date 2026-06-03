import { relative as relativePath, resolve as resolvePath } from "node:path";

import { RouteManifestError } from "./errors";
import { loadReactRouterConfig } from "./loaders/config";
import { loadRoutes } from "./loaders/routes";
import { findEntry } from "./loaders/utils";
import type { LoadRoutesOptions, ResolvedReactRouterConfig, ResolvedRouteManifest } from "./types";
import { mergeReactRouterConfig } from "./vendor/react-router/config/config";
import type { Preset, ReactRouterConfig } from "./vendor/react-router/config/config";
import { configRoutesToRouteManifest } from "./vendor/react-router/config/routes";
import type { RouteConfigEntry } from "./vendor/react-router/config/routes";

const ROOT_BASENAME = "root";

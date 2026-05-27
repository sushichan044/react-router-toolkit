import { route, type RouteConfig } from "@react-router/dev/routes";

const buildRoutes = async (): Promise<RouteConfig> => [route("about", "about.tsx")];

export default buildRoutes();

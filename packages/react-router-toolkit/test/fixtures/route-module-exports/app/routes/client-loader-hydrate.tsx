export const clientLoader = async () => {
  return { client: true };
};
clientLoader.hydrate = true;

export default function ClientLoaderHydrateRoute() {
  return null;
}

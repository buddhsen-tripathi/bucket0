import { data } from "react-router";

/** Catch-all: surface a 404 so the root ErrorBoundary renders the not-found page. */
export function loader() {
  throw data(null, { status: 404 });
}

export default function NotFoundRoute() {
  return null;
}

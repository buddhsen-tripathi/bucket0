/**
 * `next/navigation` replacement on top of React Router hooks.
 */

import { useMemo } from "react";
import {
  data,
  redirect as routerRedirect,
  useLocation,
  useNavigate,
  useParams as routerUseParams,
  useRevalidator,
  useSearchParams as routerUseSearchParams,
} from "react-router";

export function useRouter() {
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  return useMemo(
    () => ({
      push: (href: string) => void navigate(href),
      replace: (href: string) => void navigate(href, { replace: true }),
      back: () => void navigate(-1),
      forward: () => void navigate(1),
      refresh: () => void revalidate(),
      prefetch: (_href: string) => {},
    }),
    [navigate, revalidate]
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return routerUseSearchParams()[0];
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return routerUseParams() as T;
}

/** Throw a 404 that React Router renders through the nearest ErrorBoundary. */
export function notFound(): never {
  throw data(null, { status: 404 });
}

/** Throw a redirect from a loader or action. */
export function redirect(url: string, status = 307): never {
  throw routerRedirect(url, status);
}

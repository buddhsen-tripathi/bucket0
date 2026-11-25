/**
 * `SignedIn` / `SignedOut` were removed from @clerk/react in favour of
 * `<Show when=...>`. Keep the old names so call sites stay readable.
 */

import { Show } from "@clerk/react-router";

export function SignedIn({ children }: { children: React.ReactNode }) {
  return <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  return <Show when="signed-out">{children}</Show>;
}

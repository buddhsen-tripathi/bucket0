/** Replacement for `next/headers`: the current request's headers. */

import { getRequestContext } from "@/server/context";

export async function headers(): Promise<Headers> {
  return getRequestContext().request.headers;
}

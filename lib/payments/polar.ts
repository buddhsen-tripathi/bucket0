import { Polar } from "@polar-sh/sdk";

let client: Polar | undefined;

function getPolar(): Polar {
  if (!client) {
    client = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
      server: (process.env.NEXT_PUBLIC_POLAR_SERVER as "sandbox" | "production") || "sandbox",
    });
  }
  return client;
}

/** Lazily constructed Polar client (env is not available at module scope on Workers). */
export const polar: Polar = new Proxy({} as Polar, {
  get(_target, prop) {
    const target = getPolar();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

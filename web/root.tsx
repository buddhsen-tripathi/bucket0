import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { ClerkProvider } from "@clerk/react-router";
import { rootAuthLoader } from "@clerk/react-router/ssr.server";
import { clerkMiddleware } from "@clerk/react-router/server";
import "./app.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { constructMetadata } from "@/lib/shared/seo";
import { JsonLd } from "@/components/JsonLd";
import ConditionalLayout from "@/components/ConditionalLayout";
import { nextMeta } from "@/web/compat/meta";
import NotFoundPage from "@/web/pages/not-found";
import RouteErrorPage from "@/web/pages/route-error";

export const meta = () =>
  nextMeta(constructMetadata({ title: "Bucket0 | Cloud Storage with AgentBucket for AI Agents" }));

export const links = () => [
  { rel: "preconnect", href: "https://www.googletagmanager.com" },
  { rel: "preconnect", href: "https://www.google-analytics.com" },
  { rel: "dns-prefetch", href: "https://clerk.bucket0.com" },
];

export const middleware = [
  clerkMiddleware({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  }),
];

export async function loader(args: LoaderFunctionArgs) {
  return rootAuthLoader(args, {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  });
}

// Optional analytics and ads; set these at build time to enable them.
const GA_MEASUREMENT_ID = import.meta.env.NEXT_PUBLIC_GA_MEASUREMENT_ID as string | undefined;
const ADSENSE_CLIENT_ID = import.meta.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID as string | undefined;

const gaSnippet = (id: string) => `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(id)});
`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {GA_MEASUREMENT_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: gaSnippet(GA_MEASUREMENT_ID) }} />
          </>
        )}
        {ADSENSE_CLIENT_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="antialiased bg-background text-foreground">
        <JsonLd type="organization" />
        <JsonLd type="software" />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Providers({ loaderData, children }: { loaderData: unknown; children: React.ReactNode }) {
  return (
    <ClerkProvider loaderData={loaderData} signInUrl="/sign-in" signUpUrl="/sign-up">
      <ThemeProvider>
        <ToastProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
        </ToastProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default function App({ loaderData }: { loaderData: unknown }) {
  return (
    <Providers loaderData={loaderData}>
      <Outlet />
    </Providers>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const loaderData = useRouteLoaderData("root");
  const page =
    isRouteErrorResponse(error) && error.status === 404 ? <NotFoundPage /> : <RouteErrorPage error={error} />;

  // Loader data is present when the root loader succeeded, so Clerk-aware chrome can render.
  if (loaderData) {
    return <Providers loaderData={loaderData}>{page}</Providers>;
  }
  return (
    <ThemeProvider>
      <ToastProvider>{page}</ToastProvider>
    </ThemeProvider>
  );
}


import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react-router";
import { useSignIn } from "@clerk/react-router/legacy";
import { useRouter, useSearchParams } from "@/web/compat/navigation";
import Link from "@/web/compat/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

interface ClerkError {
  errors?: Array<{ longMessage?: string; message?: string }>;
}

const REDIRECT_URL_KEY = "bucket0_auth_redirect";

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get redirect URL from params (used for invite flow)
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  // If the user is already signed in, skip the form and honor redirect_url.
  useEffect(() => {
    if (isAuthLoaded && isSignedIn) {
      router.replace(redirectUrl);
    }
  }, [isAuthLoaded, isSignedIn, redirectUrl, router]);

  // Prefill email from URL params and handle OAuth errors
  useEffect(() => {
    const emailParam = searchParams.get("email_address") || searchParams.get("email");
    if (emailParam) setEmail(emailParam);

    // Handle OAuth error redirects
    const errorParam = searchParams.get("error");
    if (errorParam === "oauth_failed") {
      setError("Google sign in failed. Please try again or use email/password.");
    }
  }, [searchParams]);

  // Handle email/password sign in
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else {
        setError("Sign in incomplete. Please try again.");
      }
    } catch (err) {
      const clerkError = err as ClerkError;
      const errorMessage = clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "Sign in failed. Please check your credentials.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth sign in
  const handleGoogleOAuth = async () => {
    if (!isLoaded || !signIn) return;

    try {
      // Store redirect URL in sessionStorage for the SSO callback
      if (redirectUrl !== "/dashboard") {
        sessionStorage.setItem(REDIRECT_URL_KEY, redirectUrl);
      }

      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/dashboard", // We handle actual redirect in callback
      });
    } catch {
      setError("Google sign in failed. Please try again.");
    }
  };

  if (!isLoaded || (isAuthLoaded && isSignedIn)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm px-4 py-12">
      <div className="w-full max-w-[400px] relative animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card border border-border rounded-md shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your Bucket0 account
            </p>
          </div>

          {/* Google OAuth button */}
          <button
            onClick={handleGoogleOAuth}
            className="w-full py-2.5 px-4 bg-background hover:bg-muted border border-border rounded font-medium text-foreground text-sm transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <FcGoogle className="w-5 h-5" />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Clerk CAPTCHA */}
            <div id="clerk-captcha" className="flex justify-center" />

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-primary text-primary-foreground font-medium text-sm rounded hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Sign up link */}
          <p className="text-sm text-center mt-6 text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={redirectUrl !== "/dashboard" ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}` : "/sign-up"}
              className="text-primary hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export const meta = () =>
  nextMeta(constructMetadata({ title: "Sign In", description: "Sign in to your Bucket0 account.", noIndex: true }));

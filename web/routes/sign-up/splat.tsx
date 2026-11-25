
import { useState, useEffect } from "react";
import { useSignUp } from "@clerk/react-router/legacy";
import { useRouter, useSearchParams } from "@/web/compat/navigation";
import Link from "@/web/compat/link";
import { Eye, EyeOff, Loader2, X, Check } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

interface ClerkError {
  errors?: Array<{ longMessage?: string; message?: string }>;
}

const REDIRECT_URL_KEY = "bucket0_auth_redirect";

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Get redirect URL from params (used for invite flow)
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  // Prefill email from URL params and handle OAuth errors
  useEffect(() => {
    const emailParam = searchParams.get("email_address") || searchParams.get("email");
    if (emailParam) setEmail(emailParam);

    // Handle OAuth error redirects
    const errorParam = searchParams.get("error");
    if (errorParam === "oauth_failed") {
      setError("An account with this email already exists. Please sign in instead.");
    }
  }, [searchParams]);

  // Calculate password strength
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    setPasswordStrength(strength);
  }, [password]);

  // Handle email/password sign up
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError(null);

    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });

      // Send email verification code
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      const clerkError = err as ClerkError;
      const errorMessage = clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "Sign up failed. Please try again.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle verification code submission
  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      // Check if session was created - primary success indicator
      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
        return;
      }

      // Handle status
      if (result.status === "complete") {
        // Status complete but no session - check signUp object
        if (signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
        }
        router.push(redirectUrl);
      } else if (result.status === "missing_requirements") {
        // For email/password flow with names, this shouldn't happen
        // But if it does, try to proceed anyway
        if (signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
          router.push(redirectUrl);
        } else {
          setError("Additional information required. Please try again.");
        }
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err) {
      const clerkError = err as ClerkError;
      const errorMessage = clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "Verification failed. Please check your code.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth sign up
  const handleGoogleOAuth = async () => {
    if (!isLoaded || !signUp) return;

    try {
      // Store redirect URL in sessionStorage for the SSO callback
      if (redirectUrl !== "/dashboard") {
        sessionStorage.setItem(REDIRECT_URL_KEY, redirectUrl);
      }

      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: "/dashboard", // We handle actual redirect in callback
      });
    } catch {
      setError("Google sign up failed. Please try again.");
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return "bg-red-500";
    if (passwordStrength === 2) return "bg-yellow-500";
    if (passwordStrength === 3) return "bg-blue-500";
    return "bg-green-500";
  };

  const getStrengthText = () => {
    if (password.length === 0) return "";
    if (passwordStrength <= 1) return "Weak";
    if (passwordStrength === 2) return "Fair";
    if (passwordStrength === 3) return "Good";
    return "Strong";
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Verification code form
  if (pendingVerification) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm px-4">
        <div className="w-full max-w-[400px] relative animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-card border border-border rounded-md shadow-2xl p-8">
            <button
              onClick={() => {
                setPendingVerification(false);
                setVerificationCode("");
                setError(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a code to <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>

            <form onSubmit={handleVerification} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Verification code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full px-3 py-3 bg-background border border-border rounded text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-center tracking-[0.5em] font-mono transition-all"
                  maxLength={6}
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded animate-in fade-in slide-in-from-top-1 duration-200">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || verificationCode.length < 6}
                className="w-full py-2.5 bg-primary text-primary-foreground font-medium text-sm rounded hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify email"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingVerification(false);
                  setVerificationCode("");
                  setError(null);
                }}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Use a different email
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Main sign up form
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm px-4 py-12">
      <div className="w-full max-w-[400px] relative animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card border border-border rounded-md shadow-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Start managing your cloud storage
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
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

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
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  minLength={8}
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
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-all ${
                          passwordStrength >= level ? getStrengthColor() : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${passwordStrength <= 1 ? "text-red-500" : passwordStrength === 2 ? "text-yellow-500" : passwordStrength === 3 ? "text-blue-500" : "text-green-500"}`}>
                    {getStrengthText()}
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Clerk CAPTCHA */}
            <div id="clerk-captcha" className="flex justify-center" />

            {/* Terms */}
            <p className="text-xs text-muted-foreground text-center">
              By signing up, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || password.length < 8 || !firstName.trim() || !lastName.trim()}
              className="w-full py-2.5 bg-primary text-primary-foreground font-medium text-sm rounded hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          {/* Sign in link */}
          <p className="text-sm text-center mt-6 text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={redirectUrl !== "/dashboard" ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}` : "/sign-in"}
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export const meta = () =>
  nextMeta(constructMetadata({ title: "Sign Up", description: "Create your Bucket0 account.", noIndex: true }));

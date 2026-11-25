
import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react-router";
import { useSignIn, useSignUp } from "@clerk/react-router/legacy";
import { useRouter } from "@/web/compat/navigation";
import { Loader2 } from "lucide-react";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const REDIRECT_URL_KEY = "bucket0_auth_redirect";

export default function SSOCallback() {
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const router = useRouter();
  const hasHandled = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      if (hasHandled.current) return;
      if (!isSignInLoaded || !isSignUpLoaded || !isAuthLoaded) return;

      const storedRedirect = sessionStorage.getItem(REDIRECT_URL_KEY);
      sessionStorage.removeItem(REDIRECT_URL_KEY);
      const finalRedirect = storedRedirect || "/dashboard";

      // Already signed in
      if (isSignedIn) {
        hasHandled.current = true;
        router.push(finalRedirect);
        return;
      }

      try {
        // Check sign-up session (new user)
        if (signUp?.createdSessionId) {
          hasHandled.current = true;
          await setSignUpActive({ session: signUp.createdSessionId });
          router.push(finalRedirect);
          return;
        }

        // Check sign-in session (existing user via OAuth on sign-up page)
        if (signIn?.createdSessionId) {
          hasHandled.current = true;
          await setSignInActive({ session: signIn.createdSessionId });
          router.push(finalRedirect);
          return;
        }

        // Status-based handling
        if (signUp?.status === "complete" || signIn?.status === "complete") {
          hasHandled.current = true;
          router.push(finalRedirect);
          return;
        }

        // For OAuth, missing_requirements usually means optional fields - proceed anyway
        if (signUp?.status === "missing_requirements") {
          hasHandled.current = true;
          router.push(finalRedirect);
          return;
        }
      } catch (err) {
        console.error("SSO callback error:", err);
        hasHandled.current = true;
        router.push("/sign-up?error=oauth_failed");
      }
    };

    const timer = setTimeout(handleCallback, 100);
    const fallback = setTimeout(() => {
      if (!hasHandled.current) {
        hasHandled.current = true;
        router.push("/dashboard");
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [signIn, signUp, setSignInActive, setSignUpActive, isSignInLoaded, isSignUpLoaded, isAuthLoaded, isSignedIn, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Completing sign up...</p>
      </div>
    </div>
  );
}

export const meta = () =>
  nextMeta(constructMetadata({ title: "Sign Up", description: "Create your Bucket0 account.", noIndex: true }));

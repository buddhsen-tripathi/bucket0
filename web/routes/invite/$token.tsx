
import { useEffect, useState } from "react";
import { useParams, useRouter } from "@/web/compat/navigation";
import { useUser } from "@clerk/react-router";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "@/web/compat/link";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    if (!isLoaded) return;

    // If not signed in, redirect to sign in with return URL
    if (!isSignedIn) {
      const returnUrl = encodeURIComponent(`/invite/${token}`);
      router.push(`/sign-in?redirect_url=${returnUrl}`);
      return;
    }

    // Accept the invitation
    acceptInvitation();
  }, [isLoaded, isSignedIn, token]);

  const acceptInvitation = async () => {
    try {
      const response = await fetch("/api/teams/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "Failed to accept invitation");
        return;
      }

      setStatus("success");
      setMessage(data.message || "You have joined the team!");
      setTeamName(data.team?.name || "");

      // Redirect to team page after 2 seconds
      setTimeout(() => {
        router.push("/dashboard?mode=teams");
      }, 2000);
    } catch (error) {
      console.error("Error accepting invitation:", error);
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
    }
  };

  if (!isLoaded || (isLoaded && !isSignedIn)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="bg-card border border-border rounded-lg shadow-lg p-8 text-center">
          {status === "loading" && (
            <>
              <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                Accepting Invitation
              </h1>
              <p className="text-muted-foreground">
                Please wait while we process your invitation...
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="bg-emerald-500/10 p-4 rounded-full w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                Welcome to {teamName || "the team"}!
              </h1>
              <p className="text-muted-foreground mb-6">{message}</p>
              <p className="text-sm text-muted-foreground">
                Redirecting to dashboard...
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="bg-destructive/10 p-4 rounded-full w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                Invitation Error
              </h1>
              <p className="text-muted-foreground mb-6">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/dashboard?mode=teams"
                  className="block w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Go to Teams
                </Link>
                <Link
                  href="/dashboard"
                  className="block w-full px-4 py-2 border border-border text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  Go to Dashboard
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

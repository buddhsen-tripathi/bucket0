
import { useState, useEffect } from "react";
import { useUser } from "@clerk/react-router";
import { usePathname } from "@/web/compat/navigation";
import { MessageSquarePlus, X, Loader2, Check, Bug, Lightbulb, HelpCircle, Cloud, Database, Package } from "lucide-react";

type FeedbackType = "bug" | "feature" | "other";
type FeedbackCategory = "drive" | "buckets" | "general";

interface FeedbackContext {
  userId: string;
  email: string;
  currentPage: string;
  userAgent: string;
  screenSize: string;
  timestamp: string;
  category: FeedbackCategory;
}

interface FeedbackButtonProps {
  /** If true, hides the floating button (use with externalOpen) */
  hideButton?: boolean;
  /** External control for modal visibility */
  externalOpen?: boolean;
  /** Called when modal closes (for external control) */
  onClose?: () => void;
}

export default function FeedbackButton({ hideButton, externalOpen, onClose }: FeedbackButtonProps = {}) {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (externalOpen !== undefined) {
      if (!open && onClose) onClose();
    } else {
      setInternalOpen(open);
    }
  };
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collect context information
  const [context, setContext] = useState<FeedbackContext | null>(null);

  // Update context when modal opens to capture current state
  useEffect(() => {
    if (isOpen && isLoaded && user && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const view = urlParams.get("view") || "files";
      setContext({
        userId: user.id,
        email: user.emailAddresses[0]?.emailAddress || "",
        currentPage: `${pathname}?view=${view}`,
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
        category,
      });
    }
  }, [isOpen, isLoaded, user, pathname, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter your feedback");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          message: message.trim(),
          context: { ...context, category },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsSuccess(false);
        setMessage("");
        setFeedbackType("bug");
        setCategory("general");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  const feedbackTypes = [
    { type: "bug" as const, label: "Bug", icon: Bug },
    { type: "feature" as const, label: "Feature", icon: Lightbulb },
    { type: "other" as const, label: "Other", icon: HelpCircle },
  ];

  const categories = [
    { type: "drive" as const, label: "Cloud Drive", icon: Cloud },
    { type: "buckets" as const, label: "External Buckets", icon: Database },
    { type: "general" as const, label: "General", icon: Package },
  ];

  if (!isLoaded || !user) return null;

  return (
    <>
      {/* Feedback Button - Top Right (hidden if controlled externally) */}
      {!hideButton && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40 flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 bg-muted/80 backdrop-blur-sm text-foreground border border-border rounded-full shadow-sm hover:bg-muted transition-all hover:shadow-md"
          title="Send feedback"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span className="hidden sm:inline text-sm font-medium">Feedback</span>
        </button>
      )}

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isSubmitting && setIsOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-card border border-border rounded-lg shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Send Feedback</h2>
              <button
                onClick={() => !isSubmitting && setIsOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success State */}
            {isSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Thank you!</h3>
                <p className="text-muted-foreground">Your feedback has been submitted successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      What is this regarding?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {categories.map(({ type, label, icon: Icon }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setCategory(type)}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-md border transition-all ${
                            category === type
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Type */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {feedbackTypes.map(({ type, label, icon: Icon }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFeedbackType(type)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md border transition-all ${
                            feedbackType === type
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Your feedback
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        feedbackType === "bug"
                          ? "Describe what happened and what you expected..."
                          : feedbackType === "feature"
                          ? "Describe the feature you'd like to see..."
                          : "Share your thoughts..."
                      }
                      className="w-full h-28 px-3 py-2 bg-transparent border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                      required
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

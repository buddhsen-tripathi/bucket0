
import { useState } from "react";
import { useUser } from "@clerk/react-router";
import { useRouter } from "@/web/compat/navigation";
import { motion } from "framer-motion";
import { MdOutlineDeleteForever } from "react-icons/md";

export default function AccountDeletionPage() {
    const { user, isLoaded, isSignedIn } = useUser();
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        try {
            // 1. Purge all account data (files, metadata, subscriptions) from our systems.
            const response = await fetch("/api/user", { method: "DELETE" });
            if (!response.ok) {
                throw new Error("delete-failed");
            }
            // 2. Remove the authentication account so the user can't sign back in.
            await user?.delete();
            // 3. Send them to the home page.
            router.push("/?account-deleted=1");
        } catch {
            setDeleting(false);
            setError("Something went wrong while deleting your account. Please try again or email privacy@bucket0.com.");
        }
    };

    return (
        <main className="min-h-screen bg-background">
            <section className="pt-28 lg:pt-36 pb-24">
                <div className="max-w-3xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
                            Delete Your Account
                        </h1>
                        <p className="text-muted-foreground mb-12">
                            Permanently delete your Bucket0 account and all associated data.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="prose prose-neutral dark:prose-invert max-w-none"
                    >
                        <div className="space-y-8">
                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">What gets deleted</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    Deleting your account permanently removes all of the following. This action cannot be undone.
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>All files you have stored on Bucket0, including thumbnails</li>
                                    <li>File metadata (names, sizes, types, upload timestamps) and folders</li>
                                    <li>Share links you have created</li>
                                    <li>External S3 bucket connections and their encrypted credentials</li>
                                    <li>Your subscription record and account profile</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Retention</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Your data is removed from our systems immediately upon deletion. Residual copies in
                                    backups are purged within 30 days. See our{" "}
                                    <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>{" "}
                                    for full details.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">How to delete your account</h2>
                                <p className="text-muted-foreground leading-relaxed mb-6">
                                    For your security, you must sign in to confirm you own the account before it can be deleted.
                                </p>

                                {!isLoaded ? (
                                    <div className="h-11 w-44 rounded-md bg-muted animate-pulse" />
                                ) : !isSignedIn ? (
                                    <a
                                        href="/sign-in?redirect_url=/account-deletion"
                                        className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
                                    >
                                        Sign in to continue
                                    </a>
                                ) : (
                                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
                                        <div className="flex items-start gap-3 mb-4">
                                            <MdOutlineDeleteForever className="text-destructive mt-0.5 shrink-0" size={22} />
                                            <div>
                                                <p className="text-sm font-medium text-foreground">
                                                    Signed in as {user?.primaryEmailAddress?.emailAddress}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Deleting will permanently remove your account and all data listed above.
                                                </p>
                                            </div>
                                        </div>

                                        {error && (
                                            <p className="text-sm text-destructive mb-4">{error}</p>
                                        )}

                                        {!confirming ? (
                                            <button
                                                onClick={() => setConfirming(true)}
                                                className="px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-sm transition-colors"
                                            >
                                                Delete my account
                                            </button>
                                        ) : (
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    onClick={handleDelete}
                                                    disabled={deleting}
                                                    className="px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-sm transition-colors disabled:opacity-60"
                                                >
                                                    {deleting ? "Deleting…" : "Yes, permanently delete"}
                                                </button>
                                                <button
                                                    onClick={() => setConfirming(false)}
                                                    disabled={deleting}
                                                    className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-sm transition-colors disabled:opacity-60"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Need help?</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    If you can no longer access your account, email us at{" "}
                                    <a href="mailto:privacy@bucket0.com" className="text-primary hover:underline">
                                        privacy@bucket0.com
                                    </a>{" "}
                                    and we will process your deletion request.
                                </p>
                            </section>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}

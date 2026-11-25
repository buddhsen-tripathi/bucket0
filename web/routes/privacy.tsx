
import { motion } from "framer-motion";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

export default function PrivacyPage() {
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
                            Privacy Policy
                        </h1>
                        <p className="text-muted-foreground mb-12">
                            Last updated: February 12, 2026
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
                                <h2 className="text-xl font-semibold text-foreground mb-3">Overview</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    At Bucket0, we take your privacy seriously. This Privacy Policy explains how we collect,
                                    use, store, and protect your information when you use our service. We are committed to
                                    ensuring that your privacy is protected and being transparent about our data practices.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Information We Collect</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We collect minimal information necessary to provide our service:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Account Information:</strong> Email address, name, and profile picture provided through our authentication provider (Clerk)</li>
                                    <li><strong className="text-foreground">Usage Data:</strong> Storage usage statistics, file counts, and activity logs for your account and teams</li>
                                    <li><strong className="text-foreground">File Metadata:</strong> File names, sizes, types, and upload timestamps (not file contents)</li>
                                    <li><strong className="text-foreground">Technical Data:</strong> IP address, browser type, device information, and access logs</li>
                                    <li><strong className="text-foreground">Payment Information:</strong> Processed securely by our payment provider (Polar); we do not store full payment details</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">What We Don&apos;t Collect or Access</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We are committed to a privacy-first approach:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">File Contents:</strong> We do not access, read, analyze, or scan the contents of your files</li>
                                    <li><strong className="text-foreground">Your S3 Credentials (Local Mode):</strong> When using local storage mode, credentials are encrypted in your browser and never sent to our servers</li>
                                    <li><strong className="text-foreground">AI Training:</strong> Your data is never used to train AI models or for machine learning purposes</li>
                                    <li><strong className="text-foreground">Third-Party Advertising:</strong> We do not sell your data or share it with advertisers</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">How We Use Your Information</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We use the information we collect to:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Provide, maintain, and improve our service</li>
                                    <li>Track storage usage for billing and quota enforcement</li>
                                    <li>Send important service updates, security alerts, and notifications</li>
                                    <li>Process payments and manage subscriptions</li>
                                    <li>Respond to support requests and feedback</li>
                                    <li>Detect and prevent fraud, abuse, and security threats</li>
                                    <li>Generate aggregated, anonymized analytics to improve our service</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Data Storage and Security</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We implement robust security measures to protect your data:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Encryption at Rest:</strong> Files stored on Bucket0 are encrypted using AES encryption</li>
                                    <li><strong className="text-foreground">Encryption in Transit:</strong> All data transfers use TLS 1.3 encryption</li>
                                    <li><strong className="text-foreground">S3 Credentials:</strong> When stored on our servers, credentials are encrypted with AES-256-GCM</li>
                                    <li><strong className="text-foreground">Access Controls:</strong> Strict internal access controls and authentication</li>
                                    <li><strong className="text-foreground">Infrastructure:</strong> Hosted on secure cloud infrastructure (Cloudflare R2)</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    While we implement industry-standard security measures, no system is 100% secure.
                                    We recommend maintaining your own backups of critical data.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Data Retention</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We retain your data as follows:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Active Accounts:</strong> Data is retained as long as your account is active</li>
                                    <li><strong className="text-foreground">Account Deletion:</strong> Data is permanently deleted within 30 days of account termination</li>
                                    <li><strong className="text-foreground">Plan Expiry:</strong> 30-day grace period to retrieve data after plan expiration</li>
                                    <li><strong className="text-foreground">Inactive Free Accounts:</strong> May be deleted after 12 months of inactivity with prior notice</li>
                                    <li><strong className="text-foreground">Activity Logs:</strong> Retained based on your plan (30-180 days depending on tier)</li>
                                    <li><strong className="text-foreground">Legal Requirements:</strong> Some data may be retained longer if required by law</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Team Data</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    When you participate in teams:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Team owners can see activity logs showing who uploaded, deleted, or shared files</li>
                                    <li>Your name and email may be visible to other team members</li>
                                    <li>Team messages and chat history are stored and visible to team members</li>
                                    <li>When you leave a team, files you uploaded remain with the team</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Third-Party Services</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We use the following third-party services to operate Bucket0:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Clerk:</strong> Authentication and identity management</li>
                                    <li><strong className="text-foreground">Cloudflare R2:</strong> Cloud storage infrastructure</li>
                                    <li><strong className="text-foreground">Polar:</strong> Payment processing and subscription management</li>
                                    <li><strong className="text-foreground">Neon:</strong> Database hosting</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    These services have their own privacy policies and data handling practices.
                                    We only share the minimum data necessary for these services to function.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Cookies and Local Storage</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We use minimal cookies and local storage for:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Authentication:</strong> Session cookies to keep you logged in</li>
                                    <li><strong className="text-foreground">Preferences:</strong> Theme settings and dashboard preferences</li>
                                    <li><strong className="text-foreground">Local Credentials:</strong> Encrypted S3 credentials (when using local storage mode)</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    We do not use tracking cookies or third-party analytics that follow you across websites.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Your Rights</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    You have the following rights regarding your data:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Access:</strong> Request a copy of your personal data</li>
                                    <li><strong className="text-foreground">Correction:</strong> Update or correct inaccurate information</li>
                                    <li><strong className="text-foreground">Deletion:</strong> Request deletion of your account and data</li>
                                    <li><strong className="text-foreground">Export:</strong> Download your files at any time</li>
                                    <li><strong className="text-foreground">Restriction:</strong> Request restriction of processing in certain circumstances</li>
                                    <li><strong className="text-foreground">Objection:</strong> Object to processing of your data</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    To exercise these rights, contact us at{" "}
                                    <a href="mailto:privacy@bucket0.com" className="text-primary hover:underline">
                                        privacy@bucket0.com
                                    </a>
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">International Data Transfers</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Your data may be processed and stored in countries outside your country of residence,
                                    including countries that may have different data protection laws. By using Bucket0,
                                    you consent to the transfer of your data to these countries. We ensure appropriate
                                    safeguards are in place to protect your data in accordance with this privacy policy.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Children&apos;s Privacy</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Bucket0 is not intended for users under the age of 13. We do not knowingly collect
                                    personal information from children under 13. If you believe we have collected
                                    information from a child under 13, please contact us immediately.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Changes to This Policy</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    We may update this Privacy Policy from time to time. We will notify you of significant
                                    changes via email or through the service. The &quot;Last updated&quot; date at the top of this
                                    policy indicates when it was last revised. Continued use of the service after changes
                                    constitutes acceptance of the updated policy.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">Contact Us</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    If you have any questions about this Privacy Policy or our data practices, please contact us at:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-4">
                                    <li>Email: <a href="mailto:privacy@bucket0.com" className="text-primary hover:underline">privacy@bucket0.com</a></li>
                                    <li>General inquiries: <a href="mailto:team@bucket0.com" className="text-primary hover:underline">team@bucket0.com</a></li>
                                </ul>
                            </section>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Privacy Policy",
  description: "Learn how Bucket0 protects your privacy. Your data stays yours - never used to train AI. S3 credentials stored locally.",
  keywords: [
    "privacy policy",
    "data protection",
    "secure storage",
    "privacy first",
  ],
}));

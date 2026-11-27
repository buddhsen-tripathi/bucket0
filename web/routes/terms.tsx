
import { motion } from "framer-motion";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background">
            <section className="pt-14 md:pt-24 pb-24">
                <div className="max-w-3xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="display text-[clamp(40px,5vw,64px)] leading-[1.02] text-foreground mb-4">
                            Terms of Service
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
                                <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    By accessing or using Bucket0, you agree to be bound by these Terms of Service.
                                    If you do not agree to these terms, please do not use our service. These terms
                                    constitute a legally binding agreement between you and Bucket0.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">2. Description of Service</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Bucket0 provides a cloud storage management platform that allows users to:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-4">
                                    <li>Store and manage files using Bucket0&apos;s encrypted cloud storage</li>
                                    <li>Connect and manage external S3-compatible storage buckets</li>
                                    <li>Create teams and collaborate with other users</li>
                                    <li>Share files via public or protected links</li>
                                    <li>Upload, download, preview, and organize files through our dashboard</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">3. User Accounts</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    To use Bucket0, you must create an account. You are responsible for:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Maintaining the confidentiality of your account credentials</li>
                                    <li>All activities that occur under your account</li>
                                    <li>Notifying us immediately of any unauthorized use</li>
                                    <li>Ensuring all information provided is accurate and current</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    We reserve the right to suspend or terminate accounts that remain inactive for
                                    more than 12 months on the free tier.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">4. Acceptable Use</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    You agree not to use Bucket0 to:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Store or distribute illegal content</li>
                                    <li>Violate any applicable laws or regulations</li>
                                    <li>Infringe on intellectual property rights</li>
                                    <li>Distribute malware, viruses, or harmful software</li>
                                    <li>Attempt to gain unauthorized access to our systems</li>
                                    <li>Use the service for cryptocurrency mining or similar resource-intensive activities</li>
                                    <li>Share content that is defamatory, obscene, or violates others&apos; privacy</li>
                                    <li>Circumvent storage limits or abuse the service</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    We reserve the right to remove content and disable share links that violate these
                                    terms without prior notice.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">5. Teams and Shared Storage</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    If you create a team, you become the team owner and are responsible for:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>All content uploaded by team members to your team storage</li>
                                    <li>Managing team membership and permissions</li>
                                    <li>Ensuring team members comply with these terms</li>
                                    <li>Maintaining sufficient storage quota for team activities</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    Team storage is shared from the owner&apos;s plan quota. If the owner&apos;s plan expires
                                    or downgrades, team storage limits will be adjusted accordingly. Team members are
                                    responsible for backing up their own files before leaving a team.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">6. Pricing and Payment</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    Bucket0 offers the following pricing tiers:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Free:</strong> 5 GB of encrypted storage at no cost</li>
                                    <li><strong className="text-foreground">Starter:</strong> $7/month (or $5/month billed annually) with 150 GB storage and team features</li>
                                    <li><strong className="text-foreground">Pro:</strong> $19/month (or $15/month billed annually) with 700 GB storage, API access, and team chat</li>
                                    <li><strong className="text-foreground">Scale:</strong> $45/month (or $35/month billed annually) with 2 TB storage and multiple teams</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    Prices are subject to change with 30 days notice. All fees are non-refundable unless
                                    otherwise specified. Subscriptions renew automatically unless canceled before the renewal date.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">7. Plan Expiry and Data Retention</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    When a paid subscription expires or is canceled:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Your account will revert to the free tier limits</li>
                                    <li>You will have a <strong className="text-foreground">30-day grace period</strong> to download your files or renew your subscription</li>
                                    <li>During the grace period, uploads will be disabled if you exceed free tier limits</li>
                                    <li>After 30 days, files exceeding free tier limits may be permanently deleted</li>
                                    <li>Team features will be disabled, and team members will lose access</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    We will send email notifications before any data deletion occurs. It is your
                                    responsibility to download and backup your data before your plan expires.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">8. External S3 Buckets</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    When you connect your own S3-compatible storage buckets:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>You retain full ownership and control of your data</li>
                                    <li>You are solely responsible for the security of your bucket credentials</li>
                                    <li>We are not liable for any data loss, corruption, or unauthorized access in your buckets</li>
                                    <li>You are responsible for any charges from your storage provider</li>
                                    <li>Credentials stored locally in your browser are your responsibility to protect</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    Bucket0 acts solely as an interface to your external storage and makes no guarantees
                                    about the availability or integrity of data stored in external buckets.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">9. File Sharing</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    When you share files via Bucket0:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>You are solely responsible for the content you share</li>
                                    <li>You warrant that you have the right to share the content</li>
                                    <li>Public links are accessible to anyone with the URL</li>
                                    <li>We may disable share links that violate these terms</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    Bucket0 does not monitor shared content but will respond to valid legal requests
                                    and reports of abuse.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">10. Third-Party Services</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    Bucket0 relies on third-party services to operate:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li><strong className="text-foreground">Clerk:</strong> Authentication and user management</li>
                                    <li><strong className="text-foreground">Cloudflare R2:</strong> Cloud storage infrastructure</li>
                                    <li><strong className="text-foreground">Polar:</strong> Payment processing and subscriptions</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    We are not responsible for outages, data loss, or other issues caused by these
                                    third-party services. Your use of Bucket0 is also subject to the terms and
                                    privacy policies of these providers.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">11. Data Security and Encryption</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    We employ encryption to protect your data:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Files are encrypted at rest using AES encryption</li>
                                    <li>Data in transit is protected with TLS 1.3</li>
                                    <li>Encryption keys are managed server-side</li>
                                </ul>
                                <p className="text-muted-foreground leading-relaxed mt-4">
                                    While we implement industry-standard security measures, no system is completely
                                    secure. We are not liable for data breaches, decryption failures, or security
                                    incidents beyond our reasonable control. You are responsible for maintaining
                                    your own backups of important data.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">12. Service Availability</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    We strive to maintain 99.9% uptime for our service. However, we do not guarantee
                                    uninterrupted access and may perform maintenance that temporarily affects availability.
                                    We will provide reasonable notice for planned maintenance when possible.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">13. Limitation of Liability</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    TO THE MAXIMUM EXTENT PERMITTED BY LAW:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                    <li>Bucket0 is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without warranties of any kind, express or implied</li>
                                    <li>We disclaim all warranties including merchantability, fitness for a particular purpose, and non-infringement</li>
                                    <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages</li>
                                    <li>We are not liable for any loss of data, profits, or business opportunities</li>
                                    <li>Our total liability is limited to the amount you paid us in the 12 months preceding the claim, or $100, whichever is greater</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">14. Indemnification</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    You agree to indemnify, defend, and hold harmless Bucket0, its officers, directors,
                                    employees, and agents from any claims, damages, losses, liabilities, and expenses
                                    (including legal fees) arising from your use of the service, your violation of
                                    these terms, or your violation of any third-party rights.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">15. Termination</h2>
                                <p className="text-muted-foreground leading-relaxed mb-4">
                                    You may terminate your account at any time from your account settings. We reserve
                                    the right to suspend or terminate accounts that violate these terms without notice.
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    Upon termination:
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-2">
                                    <li>Your data will be scheduled for deletion within 30 days</li>
                                    <li>Team members will immediately lose access to your teams</li>
                                    <li>Share links will be disabled</li>
                                    <li>No refunds will be provided for unused subscription time</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">16. Governing Law</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    These Terms shall be governed by and construed in accordance with the laws of India,
                                    without regard to its conflict of law provisions. Any disputes arising from these
                                    terms or your use of the service shall be resolved in the courts of India.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">17. Changes to Terms</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    We may update these terms from time to time. We will notify you of significant
                                    changes via email or through the service at least 30 days before they take effect.
                                    Continued use after changes constitutes acceptance of the new terms. If you do
                                    not agree to the updated terms, you must stop using the service.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">18. Severability</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    If any provision of these Terms is found to be unenforceable or invalid, that
                                    provision shall be limited or eliminated to the minimum extent necessary so that
                                    these Terms shall otherwise remain in full force and effect.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-foreground mb-3">19. Contact</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    For questions about these Terms of Service, please contact us at{" "}
                                    <a href="mailto:legal@bucket0.com" className="text-primary hover:underline">
                                        legal@bucket0.com
                                    </a>
                                </p>
                            </section>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Terms of Service",
  description: "Bucket0 Terms of Service. Read our terms for using our cloud storage and S3 management platform.",
  keywords: [
    "terms of service",
    "user agreement",
    "cloud storage terms",
  ],
}));

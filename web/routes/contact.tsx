
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MdOutlineMail, MdOutlineSend, MdCheck, MdKeyboardArrowDown, MdOutlineQuestionAnswer } from "react-icons/md";
import { FaGithub, FaLinkedin, FaXTwitter } from "react-icons/fa6";
import Link from "@/web/compat/link";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

// Frontend validation
function validateForm(form: { name: string; email: string; subject: string; message: string }) {
  const errors: Record<string, string> = {};

  const name = form.name.trim();
  const email = form.email.trim();
  const message = form.message.trim();

  // Name checks
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length < 2) {
    errors.name = "Name is too short";
  } else if (name.length > 100) {
    errors.name = "Name is too long";
  } else if (/https?:\/\/|www\./i.test(name)) {
    errors.name = "Invalid name";
  }

  // Email checks
  if (!email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Invalid email address";
  } else if (email.length > 255) {
    errors.email = "Email is too long";
  }

  // Subject check
  if (!form.subject) {
    errors.subject = "Please select a subject";
  }

  // Message checks
  if (!message) {
    errors.message = "Message is required";
  } else if (message.length < 10) {
    errors.message = "Message is too short (min 10 characters)";
  } else if (message.length > 5000) {
    errors.message = "Message is too long (max 5000 characters)";
  } else {
    // Link spam: more than 3 URLs
    const urlCount = (message.match(/https?:\/\//gi) || []).length;
    if (urlCount > 3) {
      errors.message = "Too many links in message";
    }
    // Repetitive characters (e.g. "aaaaaaaaaa")
    if (/(.)\1{9,}/i.test(message)) {
      errors.message = "Message appears to be spam";
    }
  }

  return errors;
}

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  // Honeypot field (hidden from real users, bots fill it in)
  const [website, setWebsite] = useState("");
  // Track when form was loaded to detect instant submissions
  const [loadedAt] = useState(() => Date.now());

  const subjectOptions = [
    { value: "general", label: "General Inquiry" },
    { value: "support", label: "Technical Support" },
    { value: "billing", label: "Billing Question" },
    { value: "partnership", label: "Partnership" },
    { value: "feedback", label: "Feedback" },
    { value: "other", label: "Other" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    // Frontend validation
    const errors = validateForm(formState);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsSubmitting(false);
      return;
    }

    // Honeypot check — if filled, silently "succeed"
    if (website) {
      await new Promise((r) => setTimeout(r, 1000));
      setIsSubmitted(true);
      setFormState({ name: "", email: "", subject: "", message: "" });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          _t: Date.now() - loadedAt, // time on page in ms
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      setIsSubmitted(true);
      setFormState({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormState((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubjectSelect = (value: string) => {
    setFormState((prev) => ({ ...prev, subject: value }));
    setShowSubjectDropdown(false);
  };

  return (
    <main className="min-h-screen pt-14 md:pt-24 pb-24 px-6 relative overflow-hidden">

      <div className="max-w-5xl mx-auto relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="display text-[clamp(42px,5.4vw,76px)] leading-[0.98] text-foreground mb-5">
            Get in touch
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Have a question, feedback, or just want to say hello? We&apos;d love to hear from you.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto"
        >
          {/* Contact Form Card */}
          <motion.div variants={itemVariants} className="group">
            <div className="h-full bg-card border border-border rounded-xs p-6 sm:p-8 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="w-10 h-10 rounded-xs bg-primary/10 flex items-center justify-center mb-4">
                  <MdOutlineSend className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-1">Send a Message</h3>
                <p className="text-sm text-muted-foreground mb-6">Fill out the form and we&apos;ll get back to you.</p>

                {isSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-xs bg-success/10 text-success mb-4">
                      <MdCheck size={32} />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      Message Sent!
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Thanks for reaching out. We&apos;ll get back to you soon.
                    </p>
                    <button
                      onClick={() => setIsSubmitted(false)}
                      className="text-primary hover:underline underline-offset-4 text-sm font-medium"
                    >
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Honeypot — hidden from real users */}
                    <div className="absolute opacity-0 -z-10 h-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
                      <label htmlFor="website">Website</label>
                      <input
                        type="text"
                        id="website"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label
                          htmlFor="name"
                          className="block text-sm font-medium text-foreground mb-2"
                        >
                          Name
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formState.name}
                          onChange={handleChange}
                          required
                          maxLength={100}
                          className={cn(
                            "w-full px-4 py-3 bg-muted/30 border rounded-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all",
                            fieldErrors.name ? "border-destructive" : "border-border"
                          )}
                          placeholder="Your name"
                        />
                        {fieldErrors.name && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-foreground mb-2"
                        >
                          Email
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formState.email}
                          onChange={handleChange}
                          required
                          maxLength={255}
                          className={cn(
                            "w-full px-4 py-3 bg-muted/30 border rounded-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all",
                            fieldErrors.email ? "border-destructive" : "border-border"
                          )}
                          placeholder="you@example.com"
                        />
                        {fieldErrors.email && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <label
                        htmlFor="subject"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Subject
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowSubjectDropdown(!showSubjectDropdown)}
                        className="w-full px-4 py-3 bg-muted/30 border border-border rounded-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all flex items-center justify-between"
                      >
                        <span className={cn(!formState.subject && "text-muted-foreground")}>
                          {formState.subject
                            ? subjectOptions.find((opt) => opt.value === formState.subject)?.label
                            : "Select a topic"}
                        </span>
                        <MdKeyboardArrowDown size={16}/>
                      </button>

                      <AnimatePresence>
                        {showSubjectDropdown && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setShowSubjectDropdown(false)}
                            />
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.15 }}
                              className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-xs shadow-xl overflow-hidden z-50"
                            >
                              {subjectOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleSubjectSelect(option.value)}
                                  className={cn(
                                    "w-full px-4 py-2.5 text-left text-sm transition-colors",
                                    formState.subject === option.value
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-foreground hover:bg-muted"
                                  )}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <div>
                      <label
                        htmlFor="message"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        value={formState.message}
                        onChange={handleChange}
                        required
                        rows={5}
                        maxLength={5000}
                        className={cn(
                          "w-full px-4 py-3 bg-muted/30 border rounded-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all resize-none",
                          fieldErrors.message ? "border-destructive" : "border-border"
                        )}
                        placeholder="How can we help you?"
                      />
                      <div className="flex justify-between mt-1">
                        {fieldErrors.message ? (
                          <p className="text-xs text-destructive">{fieldErrors.message}</p>
                        ) : <span />}
                        <span className="text-xs text-muted-foreground">{formState.message.length}/5000</span>
                      </div>
                    </div>

                    {error && (
                      <p className="text-sm text-destructive">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xs transition-all font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <MdOutlineSend size={18} />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Contact Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground"
        >
          <a
            href="mailto:team@bucket0.com"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <MdOutlineMail className="w-4 h-4 text-primary" />
            <span>team@bucket0.com</span>
          </a>
          <a
            href="https://github.com/bucket0-com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <FaGithub className="w-4 h-4 text-primary" />
            <span>GitHub</span>
          </a>
          <a
            href="https://x.com/bucket0dotcom"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <FaXTwitter className="w-4 h-4 text-primary" />
            <span>X</span>
          </a>
          <a
            href="https://www.linkedin.com/company/bucket0/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <FaLinkedin className="w-4 h-4 text-primary" />
            <span>LinkedIn</span>
          </a>
          <Link
            href="/#faq"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <MdOutlineQuestionAnswer className="w-4 h-4 text-primary" />
            <span>FAQ</span>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Contact",
  description:
    "Get in touch with the Bucket0 team for support, billing questions, partnerships, or product feedback.",
}));

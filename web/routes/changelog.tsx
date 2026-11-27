
import { motion } from "framer-motion";
import { entries } from "@/web/changelog/entries";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="pt-14 md:pt-24 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-16"
          >
            <h1 className="display text-[clamp(40px,5vw,64px)] leading-[1.02] text-foreground mb-4">
              Changelog
            </h1>
            <p className="text-lg text-muted-foreground">
              New updates and improvements to Bucket0.
            </p>
          </motion.div>

          <div className="space-y-0">
            {entries.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.05 }}
                className="flex gap-6"
              >
                {/* Left side: date + timeline */}
                <div className="hidden sm:flex flex-col items-end w-32 shrink-0">
                  <time className="text-sm font-medium text-muted-foreground pt-0.5">
                    {entry.date}
                  </time>
                </div>

                {/* Timeline column */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="h-4 w-4 rounded-full bg-primary shrink-0" />
                  {index < entries.length - 1 && (
                    <div className="w-0.5 bg-border flex-1 min-h-full" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-12 flex-1">
                  {/* Mobile date */}
                  <time className="sm:hidden text-sm text-muted-foreground mb-2 block">
                    {entry.date}
                  </time>

                  {/* Version and category badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      v{entry.version}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      {entry.category}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    {entry.title}
                  </h2>

                  {/* Description */}
                  <p className="text-muted-foreground mb-4 leading-relaxed">
                    {entry.description}
                  </p>

                  {/* Features list */}
                  <ul className="space-y-2">
                    {entry.features.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-start gap-2 text-muted-foreground"
                      >
                        <svg
                          className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Changelog",
  description:
    "Latest updates and improvements to Bucket0 cloud storage, S3 API, external buckets, AgentBucket, and teams.",
}));

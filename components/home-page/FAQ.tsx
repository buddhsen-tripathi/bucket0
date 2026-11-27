import Link from "@/web/compat/link";
import { faqCategories } from "@/lib/shared/faq-data";
import { container, eyebrow, sectionTitle, textLink } from "@/components/site/styles";
import { cn } from "@/lib/shared/utils";

export default function FAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className={cn(container, "scroll-mt-20 grid gap-10 pt-24 md:pt-32 lg:grid-cols-[5fr_7fr] lg:gap-20")}
    >
      <div>
        <p className={eyebrow}>Questions</p>
        <h2 id="faq-heading" className={cn(sectionTitle, "mt-4")}>
          Common questions
        </h2>
        <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-[var(--ink-soft)]">
          Can&apos;t find an answer?{" "}
          <Link href="/contact" className={cn(textLink, "text-[var(--ink)]")}>
            Get in touch
          </Link>
          .
        </p>
      </div>
      <div className="space-y-10">
        {faqCategories.map((category) => (
          <div key={category.title}>
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">{category.title}</h3>
            <div className="mt-3 border-t border-[var(--line)]">
              {category.questions.map((item) => (
                <details key={item.question} className="group border-b border-[var(--line)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span aria-hidden className="relative size-3.5 shrink-0">
                      <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                      <span className="absolute inset-y-0 left-1/2 w-px bg-current transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pr-8 pb-5 text-[15px] leading-relaxed text-[var(--ink-soft)]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

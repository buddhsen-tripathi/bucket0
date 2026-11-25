
import Link from "@/web/compat/link";
import { motion, cubicBezier } from "framer-motion";
import { Bot, Check, Plug, ArrowRight } from "lucide-react";
import { SiClaude } from "react-icons/si";
import { AiOutlineOpenAI } from "react-icons/ai";
import { BsCursorFill } from "react-icons/bs";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: cubicBezier(0.4, 0, 0.2, 1) },
  },
};

const lineVariant = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.2 + i * 0.12,
      duration: 0.4,
      ease: cubicBezier(0.4, 0, 0.2, 1),
    },
  }),
};

const connectors = [
  { name: "Claude", icon: <SiClaude className="size-4" /> },
  { name: "ChatGPT", icon: <AiOutlineOpenAI className="size-4" /> },
  { name: "Cursor", icon: <BsCursorFill className="size-4" /> },
  { name: "Any MCP client", icon: <Plug className="size-4" /> },
];

export default function AgentBucketShowcase() {
  return (
    <section className="py-32 bg-background relative overflow-hidden">

      <div className="max-w-6xl mx-auto px-6 relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            File system for AI agents
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your agent saves files and recalls them by meaning, across every session. Plug it into Claude, ChatGPT, or Cursor. Encrypted by default, and never used to train AI.
          </p>
        </motion.div>

        {/* Terminal mockup — two acts: save, then recall */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: cubicBezier(0.4, 0, 0.2, 1) }}
          className="relative max-w-3xl mx-auto"
        >
          {/* Ambient glow */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 blur-3xl" />

          <div className="relative bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            {/* Terminal header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-muted-foreground/30" />
                  <div className="size-3 rounded-full bg-muted-foreground/30" />
                  <div className="size-3 rounded-full bg-muted-foreground/30" />
                </div>
                <span className="ml-3 text-xs text-muted-foreground font-mono">agent-session</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bot className="size-3.5 text-primary" />
                <span className="font-mono">agentbucket</span>
              </div>
            </div>

            {/* Terminal body */}
            <div className="p-6 font-mono text-sm space-y-3 min-h-[440px]">
              {/* Act 1 — save */}
              <motion.div custom={0} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-start gap-2">
                <span className="text-primary shrink-0">{">"}</span>
                <span className="text-foreground">Research the latest LLM benchmarks and save the results</span>
              </motion.div>

              <motion.div custom={1} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-start gap-2 text-muted-foreground pl-4">
                <span className="text-emerald-500">•</span>
                <span>Compiling MMLU, HumanEval, GPQA, SWE-bench…</span>
              </motion.div>

              <motion.div custom={2} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="pl-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">⏺</span>
                  <span className="font-semibold text-foreground">agentbucket</span>
                  <span>(save_file)</span>
                </div>
                <div className="pl-5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/60">path:</span>{" "}
                  <span className="text-primary">research/benchmarks/summary.md</span>
                </div>
              </motion.div>

              <motion.div custom={3} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="pl-9 text-xs text-emerald-500 flex items-center gap-1.5">
                <Check className="size-3.5" />
                <span>Saved &amp; indexed for memory</span>
              </motion.div>

              {/* Session divider */}
              <motion.div custom={4} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-center gap-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                <div className="h-px flex-1 bg-border" />
                a week later · new session
                <div className="h-px flex-1 bg-border" />
              </motion.div>

              {/* Act 2 — recall by meaning */}
              <motion.div custom={5} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-start gap-2">
                <span className="text-primary shrink-0">{">"}</span>
                <span className="text-foreground">What did we conclude about GPQA last week?</span>
              </motion.div>

              <motion.div custom={6} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="pl-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">⏺</span>
                  <span className="font-semibold text-foreground">agentbucket</span>
                  <span>(search_memory)</span>
                </div>
                <div className="pl-5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/60">query:</span>{" "}
                  <span className="text-foreground">&quot;GPQA benchmark conclusions&quot;</span>
                </div>
              </motion.div>

              <motion.div custom={7} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="pl-9 text-xs text-emerald-500 flex items-start gap-1.5">
                <Check className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  summary.md <span className="text-muted-foreground">· score 0.82</span>{" "}
                  <span className="text-muted-foreground">— &quot;GPQA topped out at 71%, led by…&quot;</span>
                </span>
              </motion.div>

              <motion.div custom={8} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="pt-2 text-foreground">
                From your AgentBucket memory: last week&apos;s{" "}
                <span className="text-primary font-semibold">summary.md</span> found GPQA peaking at 71%. No need to re-run the research.
              </motion.div>

              {/* Cursor */}
              <motion.div custom={9} variants={lineVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-center gap-2 pt-1">
                <span className="text-primary">{">"}</span>
                <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-2 h-4 bg-primary" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Connector strip */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-muted-foreground mb-4">Connect it from your agent in one line</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {connectors.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground"
              >
                <span className="text-muted-foreground">{c.icon}</span>
                {c.name}
              </span>
            ))}
          </div>
          <Link
            href="/docs"
            className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read the integration guide
            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>

        {/* Bottom features */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ delay: 0.45 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground"
        >
          {[
            "Save, search, read, and organize files",
            "Semantic memory, built in",
            "Encrypted, never trains AI",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

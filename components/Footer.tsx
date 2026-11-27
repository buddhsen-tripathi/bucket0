
import Link from "@/web/compat/link";
import { Logo } from "@/components/Logo";
import { container, GITHUB_URL } from "@/components/site/styles";
import { cn } from "@/lib/shared/utils";
import { SiClaude, SiPerplexity } from "react-icons/si";
import { AiOutlineOpenAI } from "react-icons/ai";

const aiQuery = encodeURIComponent(`What is Bucket0 (https://bucket0.com)?

Bucket0 is built on one idea: pay for storage, then use it however you like. You buy encrypted storage once, and the same account works through a browser app, your own connected buckets, an S3-compatible API, AgentBucket for AI agents, and shared team storage.

Ways to use your storage:
- My Drive: Upload, organize, share, and preview encrypted files in the browser
- Connect your buckets: Bring AWS S3, Cloudflare R2, Azure, DigitalOcean, MinIO, or Backblaze B2 and manage them alongside Bucket0 storage
- S3 API: Reach your storage with the AWS CLI, SDKs, WinSCP, Cyberduck, or any S3-compatible tool
- AgentBucket: Give AI agents a place to save files, then review and move the outputs into your drive
- Teams (Starter and above): Shared storage with permissions, activity logs, and chat, with no per-seat charges
- Encrypted by default: Your files are encrypted and never used to train AI

Plans (you only pay for storage):
- Free: 5 GB encrypted storage, 1 external bucket, 1 S3 API bucket
- Starter ($5/mo billed annually): 150 GB, 10 external buckets, 10 S3 API buckets, teams
- Pro ($15/mo billed annually): 700 GB, 25 external buckets, 50 S3 API buckets, team chat
- Scale ($35/mo billed annually): 2 TB, 100 external buckets, 100 S3 API buckets, multiple teams

What makes it different: most cloud storage locks you into a single interface. Bucket0 sells storage as the product and opens several doors into it: the browser app, the S3 API, your own connected buckets, AgentBucket, and teams. Teams draw from the owner's quota instead of charging per seat.

Explain what Bucket0 does, who it's for, and what makes it different from other cloud storage platforms.`);


const GrokIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815">
        </path>
    </svg>
);

const llmProviders = [
    {
        name: "ChatGPT",
        href: `https://chatgpt.com/?q=${aiQuery}`,
        icon: <AiOutlineOpenAI className="size-5" />,
    },
    {
        name: "Claude",
        href: `https://claude.ai/new?q=${aiQuery}`,
        icon: <SiClaude className="size-5" />,
    },
    {
        name: "Perplexity",
        href: `https://www.perplexity.ai/search?q=${aiQuery}`,
        icon: <SiPerplexity className="size-5" />,
    },
    {
        name: "Grok",
        href: `https://grok.com/?q=${aiQuery}`,
        icon: <GrokIcon className="size-5" />,
    },
];

const columns = [
    {
        title: "Product",
        links: [
            { name: "AgentBucket", href: "/agentbucket" },
            { name: "Pricing", href: "/pricing" },
            { name: "Docs", href: "/docs" },
            { name: "Free tools", href: "/tools" },
            { name: "App", href: "/app" },
        ],
    },
    {
        title: "Company",
        links: [
            { name: "Changelog", href: "/changelog" },
            { name: "Contact", href: "/contact" },
            { name: "Privacy Policy", href: "/privacy" },
            { name: "Terms of Service", href: "/terms" },
        ],
    },
    {
        title: "Elsewhere",
        links: [
            { name: "GitHub", href: GITHUB_URL, external: true },
            { name: "X", href: "https://x.com/bucket0dotcom", external: true },
            { name: "LinkedIn", href: "https://www.linkedin.com/company/bucket0", external: true },
        ],
    },
];

export default function Footer() {
    return (
        <footer className="mt-16 border-t border-[var(--line)]">
            <div className={cn(container, "grid gap-12 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-20")}>
                <div className="max-w-sm">
                    <Link href="/" className="flex items-center gap-2.5" aria-label="Bucket0 home">
                        <Logo size={22} />
                        <span className="text-[16px] font-semibold tracking-[-0.03em]">Bucket0</span>
                    </Link>
                    <p className="mt-4 text-[14px] leading-relaxed text-[var(--ink-soft)]">
                        A file system for AI agents, and an encrypted drive for your own files.
                    </p>
                    <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">Ask an assistant about Bucket0</p>
                    <div className="mt-3 flex items-center gap-1">
                        {llmProviders.map((provider) => (
                            <a
                                key={provider.name}
                                href={provider.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Ask ${provider.name}`}
                                aria-label={`Ask ${provider.name} about Bucket0`}
                                className="grid size-9 place-items-center rounded-[4px] text-[var(--ink-soft)] ring-1 ring-[var(--line)] transition-colors hover:text-[var(--ink)] hover:ring-[var(--ink)]"
                            >
                                {provider.icon}
                            </a>
                        ))}
                    </div>
                </div>
                <nav className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
                    {columns.map((col) => (
                        <div key={col.title}>
                            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">{col.title}</p>
                            <ul className="mt-4 space-y-2.5 text-[14px]">
                                {col.links.map((item) => (
                                    <li key={item.name}>
                                        {"external" in item ? (
                                            <a href={item.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--violet)]">
                                                {item.name}
                                            </a>
                                        ) : (
                                            <Link href={item.href} className="transition-colors hover:text-[var(--violet)]">
                                                {item.name}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
            </div>
            <div className={container}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-6 text-[13px] text-[var(--ink-soft)]">
                    <span>© {new Date().getFullYear()} Bucket0</span>
                    <span className="font-mono text-[12px]">Open source under AGPL-3.0</span>
                </div>
            </div>
            <div aria-hidden className={cn(container, "overflow-hidden")}>
                <p className="display -mb-[0.22em] select-none text-center text-[clamp(80px,21vw,330px)] leading-[0.8] tracking-[-0.06em] text-[var(--paper-2)]">
                    Bucket0
                </p>
            </div>
        </footer>
    );
}

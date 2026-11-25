
import Link from "@/web/compat/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut } from "@/components/clerk-compat";
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

const navigation = [
    { name: "Features", href: "/#features" },
    { name: "Pricing", href: "/pricing" },
    { name: "App", href: "/app" },
];

const social = [
    { name: "GitHub", href: "https://github.com/bucket0-com" },
    { name: "X", href: "https://x.com/bucket0dotcom" },
    { name: "LinkedIn", href: "https://www.linkedin.com/company/bucket0" },
];

const legal = [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Changelog", href: "/changelog" },
    { name: "Contact", href: "/contact" }
];

export default function Footer() {
    return (
        <footer className="flex flex-col items-center gap-14 pt-12 lg:pt-20">
            <div className="max-w-6xl mx-auto px-6 space-y-4 text-center">
                <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl font-bold text-foreground">
                    Start managing your storage today
                </h2>
                <p className="text-muted-foreground mx-auto max-w-xl leading-snug text-balance">
                    Upload files, connect your buckets, use S3-compatible tools, or let AI agents save work into AgentBucket.
                </p>
                <div>
                    <SignedOut>
                        <Button size="lg" className="mt-4 rounded" asChild>
                            <Link href="/sign-up">
                                Get started free
                            </Link>
                        </Button>
                    </SignedOut>
                    <SignedIn>
                        <Button size="lg" className="mt-4 rounded" asChild>
                            <Link href="/dashboard">
                                Go to Dashboard
                            </Link>
                        </Button>
                    </SignedIn>
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-muted-foreground/80 text-sm italic">
                    Request an AI summary of Bucket0
                </p>
                <div className="flex items-center gap-4">
                    {llmProviders.map((provider) => (
                        <a
                            key={provider.name}
                            href={provider.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Ask ${provider.name}`}
                            className="text-muted-foreground/70 transition-colors hover:text-foreground"
                        >
                            {provider.icon}
                        </a>
                    ))}
                </div>
            </div>

            <nav className="max-w-6xl mx-auto px-6 flex flex-col items-center gap-4">
                <ul className="flex flex-wrap items-center justify-center gap-6">
                    {navigation.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className="font-medium text-foreground transition-opacity hover:opacity-75"
                            >
                                {item.name}
                            </Link>
                        </li>
                    ))}
                    {social.map((item) => (
                        <li key={item.name}>
                            <a
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-0.5 font-medium text-foreground transition-opacity hover:opacity-75"
                            >
                                {item.name} <ArrowUpRight className="size-4" />
                            </a>
                        </li>
                    ))}
                </ul>
                <ul className="flex flex-wrap items-center justify-center gap-6">
                    {legal.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
                            >
                                {item.name}
                            </Link>
                        </li>
                    ))}
                    <li>
                        <span className="text-muted-foreground text-sm">
                            © {new Date().getFullYear()} Bucket0
                        </span>
                    </li>
                </ul>
            </nav>

            <div className="w-full max-w-7xl mx-auto sm:mt-2 mt-6 space-y-0">
                <div className="h-px w-full overflow-hidden">
                    <div
                        className="h-full w-[200%] animate-[flowBorder_3s_linear_infinite]"
                        style={{
                            background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), hsl(var(--primary)), hsl(var(--primary) / 0.6), transparent, transparent)",
                            backgroundSize: "50% 100%",
                        }}
                    />
                </div>

                <div className="text-primary w-full overflow-hidden">
                    <svg
                        viewBox="0 10 800 140"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-full block"
                        preserveAspectRatio="xMidYMin meet"
                    >
                        <defs>
                            <linearGradient
                                id="bucket0-gradient"
                                x1="400"
                                y1="10"
                                x2="400"
                                y2="140"
                                gradientUnits="userSpaceOnUse"
                            >
                                <stop stopColor="currentColor" />
                                <stop offset="1" stopColor="currentColor" stopOpacity="0.1" />
                            </linearGradient>
                        </defs>
                        <text
                            x="400"
                            y="175"
                            textAnchor="middle"
                            className="font-bold"
                            fill="url(#bucket0-gradient)"
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '180px', letterSpacing: '-0.05em' }}
                            textLength="760"
                            lengthAdjust="spacing"
                        >
                            BUCKET0
                        </text>
                    </svg>
                </div>
            </div>
        </footer>
    );
}
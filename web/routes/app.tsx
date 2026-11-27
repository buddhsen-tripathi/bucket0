import type { CSSProperties } from "react";
import { Bell } from "lucide-react";
import { AiFillApple } from "react-icons/ai";
import { BucketsPhone, DrivePhone, UploadPhone } from "@/components/app-page/Phones";
import { ArrowRightIcon, DatabaseIcon, SparkleAi01Icon, UploadUpIcon } from "@/components/icons";
import { BrushPanel } from "@/components/site/BrushPanel";
import { SectionHead } from "@/components/site/SectionHead";
import { button, container, eyebrow } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.bucket0";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const FEATURES = [
  {
    icon: DatabaseIcon,
    title: "Every bucket in one list",
    body: "Your Bucket0 storage sits next to the buckets you connect from AWS S3, Cloudflare R2, DigitalOcean, Backblaze and other S3-compatible providers.",
  },
  {
    icon: UploadUpIcon,
    title: "Upload from your phone",
    body: "Take a photo, record a video or pick a document and upload it straight from your device.",
  },
  {
    icon: Bell,
    title: "Push notifications",
    body: "Team activity, shared files and storage alerts arrive on your phone, so you know when something changes.",
  },
  {
    icon: SparkleAi01Icon,
    title: "AgentBucket included",
    body: "The same account gives your AI agents persistent file storage they reach through a simple API.",
  },
];

function PlayButton({ tone = "solid" }: { tone?: "solid" | "light" }) {
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={cn(button[tone], "group")}>
      Get it on Google Play
      <ArrowRightIcon aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

function IosNote({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-[3px] px-4 py-2.5 text-[14px] ring-1",
        dark ? "text-white/70 ring-white/25" : "text-[var(--ink-soft)] ring-[var(--line)]"
      )}
    >
      <AiFillApple aria-hidden className="size-4" />
      iOS coming soon
    </span>
  );
}

export default function DownloadAppPage() {
  const { resolvedTheme } = useTheme();
  return (
    <main>
      <section className={cn(container, "pt-14 pb-20 md:pt-24 md:pb-24")}>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
          <div>
            <p className={cn(eyebrow, "rise inline-flex items-center gap-2")}>
              <span className="size-1.5 rounded-full bg-[var(--violet)]" />
              Now on Google Play
            </p>
            <h1 className="display rise mt-5 text-balance text-[clamp(46px,5.8vw,88px)] leading-[0.96]" style={delay(60)}>
              Your cloud storage, always with you
            </h1>
          </div>
          <div className="rise flex flex-col justify-end lg:pb-2" style={delay(300)}>
            <p className="max-w-[560px] text-[19px] leading-[1.45] text-[var(--ink)]/85 md:text-[21px]">
              Open your files, manage your buckets and keep up with your team from your phone. Available now on
              Android.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PlayButton />
              <IosNote />
            </div>
          </div>
        </div>

        <div className="rise mt-14 md:mt-20" style={delay(420)}>
          <BrushPanel
            id="app-hero"
            tone={resolvedTheme === "dark" ? "night" : "lilac"}
            className="rounded-[14px] max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden"
          >
            <div aria-hidden inert className="flex items-start justify-center gap-6 md:h-[560px] md:px-8 md:pt-14 lg:gap-12">
              <BucketsPhone className="max-lg:hidden lg:mt-20" />
              <DrivePhone />
              <UploadPhone className="max-md:hidden md:mt-20" />
            </div>
          </BrushPanel>
        </div>
      </section>

      <section aria-labelledby="app-features-heading" className={cn(container, "pt-16 md:pt-32")}>
        <SectionHead id="app-features-heading" label="On your phone" title="The same account, in your pocket">
          <p>Sign in with your Bucket0 account and your drive, connected buckets and teams are there.</p>
        </SectionHead>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[12px] bg-[var(--line)] ring-1 ring-[var(--line)] sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-[var(--paper-card)] p-6 md:p-7">
              <span className="grid size-9 place-items-center rounded-[8px] bg-[var(--violet-soft)] text-[var(--violet)]">
                <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
              </span>
              <h3 className="mt-6 text-[16px] font-medium">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(container, "pt-24 pb-8 md:pt-32")}>
        <BrushPanel id="app-closing" tone="night" className="reveal rounded-[14px] text-white">
          <div className="flex min-h-[280px] flex-col items-start justify-end gap-8 p-8 md:p-14 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="display max-w-2xl text-balance text-[clamp(34px,4.6vw,60px)] leading-[1.02]">Take your files with you</h2>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/70">
                Download Bucket0 on Android and take your files everywhere.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <PlayButton tone="light" />
              <IosNote dark />
            </div>
          </div>
        </BrushPanel>
      </section>
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Mobile App with AgentBucket",
  description:
    "Download the Bucket0 Android app for cloud storage, AgentBucket, external buckets, uploads from your device, and team activity.",
}));

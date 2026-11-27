import { useEffect, useState } from "react";
import { GithubIcon, StarIcon } from "@/components/icons";
import { cn } from "@/lib/shared/utils";
import { GITHUB_URL } from "./styles";

const CACHE_KEY = "b0-github-stars";

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** The repository link with its live star count (fetched once per browser session). */
export function GithubStars({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached !== null) {
      setStars(Number(cached));
      return;
    }
    fetch("https://api.github.com/repos/buddhsen-tripathi/bucket0")
      .then((res) => (res.ok ? res.json() : null))
      .then((repo) => {
        if (typeof repo?.stargazers_count !== "number") return;
        sessionStorage.setItem(CACHE_KEY, String(repo.stargazers_count));
        setStars(repo.stargazers_count);
      })
      .catch(() => {});
  }, []);

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={stars === null ? "Bucket0 on GitHub" : `Bucket0 on GitHub, ${stars} stars`}
      className={cn(
        "inline-flex items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]",
        className
      )}
    >
      <GithubIcon aria-hidden className="size-4" />
      <span className="inline-flex min-w-[2.5ch] items-center gap-1 font-mono tabular-nums">
        <StarIcon aria-hidden className="size-3.5" />
        {stars === null ? "" : compact(stars)}
      </span>
    </a>
  );
}

/**
 * Converts the Next.js-style `Metadata` object produced by `constructMetadata()`
 * into React Router `meta` descriptors.
 *
 * Route modules call `export const meta = () => nextMeta(constructMetadata({...}))`.
 * Objects without Open Graph data (the old per-tool `{ title, description }`
 * layouts) are expanded through `constructMetadata` so every page carries the
 * full tag set.
 */

import type { MetaDescriptor } from "react-router";
import { constructMetadata, type Metadata } from "@/lib/shared/seo";

function titleOf(title: Metadata["title"]): string | undefined {
  if (!title) return undefined;
  return typeof title === "string" ? title : title.default;
}

export function nextMeta(input: Metadata): MetaDescriptor[] {
  const m: Metadata = input.openGraph
    ? input
    : constructMetadata({
        title: titleOf(input.title),
        description: input.description,
        keywords: input.keywords,
      });

  const out: MetaDescriptor[] = [];
  // Next.js applied the root template "%s | Bucket0" to every child page title.
  const rawTitle = titleOf(m.title);
  const title = rawTitle && !rawTitle.includes("Bucket0") ? `${rawTitle} | Bucket0` : rawTitle;
  if (title) out.push({ title });
  if (m.description) out.push({ name: "description", content: m.description });
  if (m.keywords?.length) out.push({ name: "keywords", content: m.keywords.join(", ") });
  if (m.creator) out.push({ name: "creator", content: m.creator });
  for (const author of m.authors ?? []) {
    out.push({ name: "author", content: author.name });
  }

  const og = m.openGraph;
  if (og) {
    if (og.type) out.push({ property: "og:type", content: og.type });
    if (og.locale) out.push({ property: "og:locale", content: og.locale });
    if (og.url) out.push({ property: "og:url", content: og.url });
    if (og.title) out.push({ property: "og:title", content: og.title });
    if (og.description) out.push({ property: "og:description", content: og.description });
    if (og.siteName) out.push({ property: "og:site_name", content: og.siteName });
    for (const image of og.images ?? []) {
      out.push({ property: "og:image", content: image.url });
      if (image.width) out.push({ property: "og:image:width", content: String(image.width) });
      if (image.height) out.push({ property: "og:image:height", content: String(image.height) });
      if (image.alt) out.push({ property: "og:image:alt", content: image.alt });
    }
  }

  const tw = m.twitter;
  if (tw) {
    if (tw.card) out.push({ name: "twitter:card", content: tw.card });
    if (tw.title) out.push({ name: "twitter:title", content: tw.title });
    if (tw.description) out.push({ name: "twitter:description", content: tw.description });
    for (const image of tw.images ?? []) out.push({ name: "twitter:image", content: image });
    if (tw.creator) out.push({ name: "twitter:creator", content: tw.creator });
  }

  if (m.robots) {
    const robots = `${m.robots.index ? "index" : "noindex"}, ${m.robots.follow ? "follow" : "nofollow"}`;
    out.push({ name: "robots", content: robots });
    const bot = m.robots.googleBot;
    if (bot) {
      const parts = [
        bot.index ? "index" : "noindex",
        bot.follow ? "follow" : "nofollow",
        `max-video-preview:${bot["max-video-preview"]}`,
        `max-image-preview:${bot["max-image-preview"]}`,
        `max-snippet:${bot["max-snippet"]}`,
      ];
      out.push({ name: "googlebot", content: parts.join(", ") });
    }
  }

  if (m.icons?.icon) out.push({ tagName: "link", rel: "icon", href: m.icons.icon });
  if (m.icons?.shortcut) out.push({ tagName: "link", rel: "shortcut icon", href: m.icons.shortcut });
  if (m.icons?.apple) out.push({ tagName: "link", rel: "apple-touch-icon", href: m.icons.apple });
  if (m.manifest) out.push({ tagName: "link", rel: "manifest", href: m.manifest });
  if (m.alternates?.canonical) out.push({ tagName: "link", rel: "canonical", href: m.alternates.canonical });

  return out;
}

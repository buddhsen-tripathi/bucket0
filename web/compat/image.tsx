/**
 * `next/image` replacement: a plain <img> that understands `fill` and `priority`.
 * Image optimization happens at the Cloudflare edge instead of in the app.
 */

import type { CSSProperties, ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

export default function Image({
  fill,
  priority,
  quality: _quality,
  unoptimized: _unoptimized,
  style,
  loading,
  ...rest
}: Props) {
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;
  return <img {...rest} style={fillStyle} loading={priority ? "eager" : loading} decoding="async" />;
}

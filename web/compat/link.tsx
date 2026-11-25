/**
 * `next/link` replacement on top of React Router's <Link>.
 * Accepts `href` and ignores the Next-only props.
 */

import { forwardRef } from "react";
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router";

type Props = Omit<RouterLinkProps, "to"> & {
  href: string;
  prefetch?: boolean | string | null;
  scroll?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
};

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _prefetch, scroll: _scroll, passHref: _passHref, legacyBehavior: _legacy, ...rest },
  ref
) {
  if (EXTERNAL.test(href)) {
    return <a ref={ref} href={href} {...rest} />;
  }
  return <RouterLink ref={ref} to={href} {...rest} />;
});

export default Link;

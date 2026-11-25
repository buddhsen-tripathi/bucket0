
import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/react-router";
import { SignedIn, SignedOut } from "@/components/clerk-compat";
import Link from "@/web/compat/link";
import { useRouter, usePathname } from "@/web/compat/navigation";
import Image from "@/web/compat/image";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/shared/utils";
import { useTheme } from "@/components/ThemeProvider";

export default function NavBar({
  promoBannerVisible = false,
}: {
  promoBannerVisible?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { resolvedTheme } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const hash = href.split("#")[1];
    if (!hash) return;

    // If we're on the home page, scroll directly
    if (pathname === "/") {
      e.preventDefault();
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // If we're on another page, navigate to home first then scroll
      e.preventDefault();
      router.push("/");
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  };

  return (
    <header
      className={cn(
        "fixed left-0 right-0 z-50 mx-auto max-w-4xl transition-all duration-300",
        promoBannerVisible ? "top-14" : "top-4",
        scrolled ? "px-4" : "px-4 md:px-0"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center justify-between rounded-full border px-4 md:px-6 backdrop-blur-md transition-all duration-300",
          scrolled
            ? "border-black/20 bg-white/70 shadow-lg shadow-black/5 dark:border-white/20 dark:bg-white/10 dark:shadow-black/20"
            : "border-black/5 bg-white/50 dark:border-white/5 dark:bg-white/5"
        )}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Logo size={24} />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {[
            { name: "Features", href: "/#features" },
            { name: "Tools", href: "/tools" },
            {name: "Docs", href: "/docs"},
            { name: "Pricing", href: "/pricing" },
            { name: "App", href: "/app" },
          ].map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={item.href.includes("#") ? (e) => handleSmoothScroll(e, item.href) : undefined}
              className="px-4 py-1.5 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-foreground/10"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden md:inline-flex items-center justify-center rounded-full bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg"
            >
              Sign In
            </Link>
          </SignedOut>

          <SignedIn>
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors overflow-hidden"
                title="Profile menu"
              >
                {user?.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-primary font-semibold text-sm">
                    {user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0] || "U"}
                  </span>
                )}
              </button>

              {/* Profile Dropdown */}
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 top-12 w-48 bg-card border border-border rounded shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => {
                        router.push('/dashboard?view=profile');
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      View profile
                    </button>
                    <div className="border-t border-border" />
                    <button
                      onClick={() => {
                        signOut();
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </SignedIn>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  isMenuOpen
                    ? "M6 18L18 6M6 6l12 12"
                    : "M4 6h16M4 12h16M4 18h16"
                }
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 left-4 right-4 rounded-sm border border-border/50 bg-background/95 backdrop-blur-xl p-4 shadow-2xl"
          >
            <nav className="flex flex-col space-y-2">
              {[
                { name: "Features", href: "/#features" },
                { name: "Tools", href: "/tools" },
                { name: "Pricing", href: "/#pricing" },
                { name: "App", href: "/app" },
              ].map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-colors"
                  onClick={(e) => {
                    if (item.href.includes("#")) {
                      handleSmoothScroll(e, item.href);
                    }
                    closeMenu();
                  }}
                >
                  {item.name}
                </Link>
              ))}
              <SignedOut>
                <Link
                  href="/sign-in"
                  className="mt-2 w-full inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                  onClick={closeMenu}
                >
                  Sign In
                </Link>
              </SignedOut>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
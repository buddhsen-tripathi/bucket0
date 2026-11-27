
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
import { button, container, GITHUB_URL } from "@/components/site/styles";
import { GithubStars } from "@/components/site/GithubStars";
import { BurgerMenuThreeIcon, GithubIcon, LogOutRightIcon, MultipleCrossCancelIcon, UserIcon } from "@/components/icons";

export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
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

  const links = [
    { name: "Features", href: "/#features" },
    { name: "Tools", href: "/tools" },
    { name: "Docs", href: "/docs" },
    { name: "Pricing", href: "/pricing" },
    { name: "App", href: "/app" },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-[var(--paper)]/85 backdrop-blur-md transition-colors duration-300",
        scrolled ? "border-[var(--line)]" : "border-transparent"
      )}
    >
      <div className={cn(container, "flex h-16 items-center gap-6 lg:gap-10")}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Bucket0 home">
          <Logo size={24} />
          <span className="text-[17px] font-semibold tracking-[-0.03em]">Bucket0</span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 lg:gap-7">
          {links.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={item.href.includes("#") ? (e) => handleSmoothScroll(e, item.href) : undefined}
              className={cn(
                "text-[14px] transition-colors hover:text-[var(--ink)]",
                pathname === item.href ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <GithubStars className="hidden sm:inline-flex" />
          <ThemeToggle />

          <SignedOut>
            <Link href="/sign-in" className={cn(button.solid, "ml-1.5 hidden md:inline-flex whitespace-nowrap px-3.5 py-2 text-[13.5px]")}>
              Sign in
            </Link>
          </SignedOut>

          <SignedIn>
            <div className="relative ml-1.5">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-[var(--paper-2)] flex items-center justify-center ring-1 ring-[var(--line)] transition-colors overflow-hidden"
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
                  <span className="font-semibold text-sm">
                    {user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0] || "U"}
                  </span>
                )}
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 top-11 w-48 bg-[var(--paper-card)] border border-[var(--line)] rounded-[6px] shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => {
                        router.push("/dashboard?view=profile");
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--paper-2)] transition-colors text-left"
                    >
                      <UserIcon aria-hidden className="size-4" />
                      View profile
                    </button>
                    <div className="border-t border-[var(--line)]" />
                    <button
                      onClick={() => {
                        signOut();
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                    >
                      <LogOutRightIcon aria-hidden className="size-4" />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </SignedIn>

          <button
            className="md:hidden p-2 text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <MultipleCrossCancelIcon aria-hidden className="size-5" /> : <BurgerMenuThreeIcon aria-hidden className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-[var(--line)] bg-[var(--paper)]"
          >
            <nav className={cn(container, "flex flex-col py-3")}>
              {links.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="border-b border-[var(--line)] py-3.5 text-[16px] last:border-b-0"
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
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-3.5 text-[16px]"
              >
                <GithubIcon aria-hidden className="size-4" />
                GitHub
              </a>
              <SignedOut>
                <Link href="/sign-in" className={cn(button.solid, "mt-2 w-full")} onClick={closeMenu}>
                  Sign in
                </Link>
              </SignedOut>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

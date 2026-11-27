
import { useEffect, useState } from "react";
import { usePathname } from "@/web/compat/navigation";
import { AnimatePresence } from "framer-motion";
import NavBar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PromoBanner from "@/components/PromoBanner";

const PROMO_STORAGE_KEY = "promo-banner-15off-dismissed";

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const isSharePage = pathname?.startsWith("/s/") || pathname?.startsWith("/ts/");
  const hideNavFooter = isDashboard || isSharePage;
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    if (hideNavFooter) {
      setShowPromo(false);
      return;
    }
    setShowPromo(localStorage.getItem(PROMO_STORAGE_KEY) !== "1");
  }, [hideNavFooter]);

  const dismissPromo = () => {
    localStorage.setItem(PROMO_STORAGE_KEY, "1");
    setShowPromo(false);
  };

  if (hideNavFooter) return <>{children}</>;

  return (
    <div className="site min-h-screen">
      <AnimatePresence>
        {showPromo && <PromoBanner onDismiss={dismissPromo} />}
      </AnimatePresence>
      <NavBar />
      {children}
      <Footer />
    </div>
  );
}

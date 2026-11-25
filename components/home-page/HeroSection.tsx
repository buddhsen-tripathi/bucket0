
import { SignedIn, SignedOut } from "@/components/clerk-compat";
import Link from "@/web/compat/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { DashedLine } from "@/components/ui/dashed-line";
import DashboardPreview from "@/components/home-page/DashboardPreview";
import { MdOutlinePeopleOutline, MdOutlineApi, MdOutlineStorage, MdOutlineCloudUpload } from "react-icons/md";

const features = [
  {
    title: "Upload in the app",
    description: "Encrypted files, folders, and sharing",
    icon: MdOutlineCloudUpload,
  },
  {
    title: "Connect your buckets",
    description: "AWS, R2, Azure, MinIO, and more",
    icon: MdOutlineStorage,
  },
  {
    title: "Use S3-compatible tools",
    description: "CLI, SDKs, Cyberduck, WinSCP, and more",
    icon: MdOutlineApi,
  },
  {
    title: "Teams",
    description: "Shared files on Starter and above, no per-seat fees",
    icon: MdOutlinePeopleOutline,
  },
];

export default function HeroSection() {
  return (
    <section className="pt-28 lg:pt-36 pb-16 bg-background">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col justify-between gap-8 md:gap-14 lg:flex-row lg:gap-20">
          {/* Left side - Main content */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 text-center flex flex-col items-center"
          >
            <h1 className="text-foreground text-4xl tracking-tight lg:text-5xl font-bold">
              Pay for storage. Use it however you like.
            </h1>

            <p className="text-muted-foreground text-lg md:text-xl mt-5 max-w-lg">
              Upload in the app, connect your own buckets, use S3-compatible tools, or let AI agents save files into AgentBucket.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:flex-nowrap">
              <SignedOut>
                <Link
                  href="/sign-up"
                  className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 min-w-[160px]"
                >
                  Get started free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </SignedOut>
              
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 min-w-[160px]"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </SignedIn>
              
              <Link
                href="/#pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border text-foreground font-medium rounded hover:bg-muted transition-all duration-200 min-w-[160px]"
              >
                View pricing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>

          {/* Right side - Features */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative flex flex-1 flex-col justify-center space-y-5 max-lg:pt-10 lg:pl-10"
          >
            <DashedLine
              orientation="vertical"
              className="absolute top-0 left-0 max-lg:hidden"
            />
            <DashedLine
              orientation="horizontal"
              className="absolute top-0 lg:hidden"
            />
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div 
                  key={feature.title} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.1 }}
                  className="flex gap-2.5 lg:gap-5"
                >
                  <Icon className="text-foreground mt-1 size-4 shrink-0 lg:size-5" />
                  <div>
                    <h2 className="text-foreground font-semibold">
                      {feature.title}
                    </h2>
                    <p className="text-muted-foreground max-w-76 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Dashboard Preview */}
        <div className="mt-12 md:mt-20 lg:mt-24">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
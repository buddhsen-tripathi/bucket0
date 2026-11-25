import Link from "@/web/compat/link";
import { ArrowRight, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center max-w-md">
        <div className="bg-primary/10 p-4 rounded-sm w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <FileQuestion className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-4">Page Not Found</h2>
        
        <p className="text-muted-foreground mb-8">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>

        <Button asChild className="rounded">
          <Link href="/" className="group inline-flex items-center gap-2">
            Return Home
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </Button>
      </div>
    </main>
  );
}

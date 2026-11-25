import { Outlet } from "react-router";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ToolsLayout() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center max-w-md">
        <div className="bg-destructive/10 p-4 rounded-sm w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-8">
          An error occurred while loading this tool. Please try again.
        </p>
        <Button onClick={() => window.location.reload()} className="rounded">
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Try again
          </span>
        </Button>
      </div>
    </main>
  );
}

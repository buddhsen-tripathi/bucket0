
import React from "react";
import { ChevronRight } from "lucide-react";

interface FileListBreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function FileListBreadcrumbs({
  currentPath,
  onNavigate,
}: FileListBreadcrumbsProps) {
  // Generate breadcrumb path segments
  const pathSegments = currentPath
    .split("/")
    .filter((seg) => seg.length > 0);

  return (
    <div className="flex items-center gap-0.5 text-xs text-muted-foreground overflow-x-auto px-3 py-2 bg-muted/20 rounded-sm border border-border">
      {/* Root/Home */}
      <button
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 px-1.5 py-0.5 hover:text-foreground hover:bg-muted/30 rounded-sm transition-colors whitespace-nowrap"
      >
        <span>Home</span>
      </button>

      {/* Path segments */}
      {pathSegments.map((segment, index) => {
        const path = pathSegments.slice(0, index + 1).join("/") + "/";
        const isLast = index === pathSegments.length - 1;

        return (
          <React.Fragment key={path}>
            <ChevronRight size={14} className="flex-shrink-0 text-muted-foreground/50" />
            <button
              onClick={() => onNavigate(path)}
              className={`px-1.5 py-0.5 rounded-sm transition-colors whitespace-nowrap text-xs ${
                isLast
                  ? "text-foreground font-medium"
                  : "hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {segment}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

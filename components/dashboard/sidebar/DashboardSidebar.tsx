
import { useState, useRef, useEffect, type ReactNode } from "react";
import Image from "@/web/compat/image";
import Link from "@/web/compat/link";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { MdOutlineCloudQueue, MdOutlineStorage, MdOutlineGroup, MdOutlineLogout, MdOutlineSchedule, MdOutlineStar, MdOutlinePerson, MdOutlineDarkMode, MdOutlineLightMode, MdChevronLeft, MdChevronRight, MdAdd, MdSettings, MdOutlineFeedback, MdOutlineKey, MdOutlineApi, MdOutlineSmartToy } from "react-icons/md";
import { Crown } from "lucide-react";
import { SiCloudflare, SiDigitalocean, SiBackblaze } from "react-icons/si";
import { TbBrandAzure } from "react-icons/tb";
import { FaAws } from "react-icons/fa6";
import { formatFileSize } from "@/lib/shared/file-utils";
import { useUser, useClerk } from "@clerk/react-router";
import { useTheme } from "@/components/ThemeProvider";
import { DashboardMode } from "@/types/dashboard";

interface Bucket {
  id: string;
  name: string;
  provider: "aws" | "r2" | "azure" | "digitalocean" | "backblaze" | "other";
}

interface Team {
  id: string;
  name: string;
  isOwner: boolean;
  memberCount: number;
}

interface S3ApiBucket {
  id: string;
  name: string;
  storageUsedFormatted: string;
}

interface DashboardSidebarProps {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
  storageUsed?: number;
  storageLimit?: number;
  plan?: string;
  onSubOptionChange?: (subOption: string) => void;
  onProfileClick?: () => void;
  onFeedbackClick?: () => void;
  buckets?: Bucket[];
  activeBucketId?: string;
  onBucketSelect?: (bucketId: string) => void;
  onManageBuckets?: () => void;
  onEditBucket?: (bucketId: string) => void;
  // Teams props
  teams?: Team[];
  activeTeamId?: string;
  onTeamSelect?: (teamId: string) => void;
  onCreateTeam?: () => void;
  // S3 API props
  s3ApiBuckets?: S3ApiBucket[];
  activeS3ApiBucketId?: string;
  onS3ApiBucketSelect?: (bucketId: string) => void;
  onManageS3ApiCredentials?: () => void;
  onCreateS3ApiBucket?: () => void;
}

function Collapsible({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function DashboardSidebar({
  mode,
  setMode,
  storageUsed = 0,
  storageLimit = 0,
  onSubOptionChange,
  onProfileClick,
  onFeedbackClick,
  buckets = [],
  activeBucketId,
  onBucketSelect,
  onManageBuckets,
  onEditBucket,
  teams = [],
  activeTeamId,
  onTeamSelect,
  onCreateTeam,
  s3ApiBuckets = [],
  activeS3ApiBucketId,
  onS3ApiBucketSelect,
  onManageS3ApiCredentials,
  onCreateS3ApiBucket,
}: DashboardSidebarProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { setTheme, resolvedTheme } = useTheme();
  const [activeSubOption, setActiveSubOption] = useState<string>("all");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  // Default to collapsed on mobile, expanded on desktop
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 1024;
    }
    return false;
  });
  // Per-section expand/collapse for the variable-length groups. Persisted so a
  // user's curated layout survives reloads. A section is open unless explicitly
  // set to false (default-open).
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sidebar-expanded-sections");
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore malformed storage
      }
    }
    return {};
  });
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const handleSubOptionClick = (subOptionId: string) => {
    setActiveSubOption(subOptionId);
    onSubOptionChange?.(subOptionId);
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-expanded-sections", JSON.stringify(expandedSections));
    } catch {
      // ignore storage write failures (private mode, quota)
    }
  }, [expandedSections]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  const providerIcons = {
    aws: FaAws,
    r2: SiCloudflare,
    azure: TbBrandAzure,
    digitalocean: SiDigitalocean,
    backblaze: SiBackblaze,
    other: MdOutlineStorage,
  };

  const menuItems = [
    {
      id: "cloud" as DashboardMode,
      label: "My Drive",
      icon: MdOutlineCloudQueue,
      subOptions: [
        { id: "all", label: "All Files", icon: MdOutlineCloudQueue },
        { id: "recent", label: "Recent", icon: MdOutlineSchedule },
        { id: "starred", label: "Starred", icon: MdOutlineStar },
      ]
    },
    {
      id: "dev" as DashboardMode,
      label: "External Buckets",
      icon: MdOutlineStorage,
      hasBuckets: true,
    },
    {
      id: "s3api" as DashboardMode,
      label: "S3 API",
      icon: MdOutlineApi,
      hasS3ApiBuckets: true,
    },
    {
      id: "agent" as DashboardMode,
      label: "AgentBucket",
      icon: MdOutlineSmartToy,
    },
    {
      id: "teams" as DashboardMode,
      label: "Teams",
      icon: MdOutlineGroup,
      hasTeams: true,
    },
  ];

  const percentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  return (
    <aside className={`
      ${isCollapsed ? 'w-16' : 'w-64'} 
      h-screen 
      flex flex-col 
      bg-background 
      border-r border-border 
      transition-all duration-300
      sticky
      top-0 left-0
      z-auto
    `}>
      {/* Logo and Collapse Button */}
      <div className={`p-4 border-b border-border flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {isCollapsed ? (
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 hover:bg-muted rounded-sm transition-colors"
            title="Expand sidebar"
          >
            <Logo size={24} />
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2">
              <Logo size={24} />
              <span className="font-semibold text-foreground text-lg">Bucket0</span>
            </Link>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 hover:bg-muted rounded-sm transition-colors"
              title="Collapse sidebar"
            >
              <MdChevronLeft size={20} />
            </button>
          </>
        )}
      </div>

      {/* Navigation — scrolls internally so the header (logo) and the footer
          (feedback / storage / profile) stay pinned at smaller viewport heights.
          `min-h-0` is required so this flex child can shrink below its content. */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = mode === item.id;
          const hasChildren = !!(item.subOptions || item.hasBuckets || item.hasS3ApiBuckets || item.hasTeams);
          const isExpanded = expandedSections[item.id] !== false;

          return (
            <div key={item.id}>
              <div
                className={`group flex items-center rounded-sm transition-all ${isCollapsed ? 'justify-center' : ''} ${isActive
                    ? "bg-primary/10"
                    : "hover:bg-muted"
                  }`}
              >
                <button
                  onClick={() => {
                    setMode(item.id);
                    if (item.subOptions) {
                      setActiveSubOption("all");
                    }
                    if (hasChildren) {
                      setExpandedSections((prev) => ({ ...prev, [item.id]: true }));
                    }
                  }}
                  className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'flex-1 gap-3'} px-4 py-2.5 transition-all ${isActive
                      ? "text-primary font-medium"
                      : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon size={20} className="flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </button>
                {!isCollapsed && hasChildren && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(item.id);
                    }}
                    className="p-2 mr-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0"
                    title={isExpanded ? "Collapse" : "Expand"}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                  >
                    <MdChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
              </div>

              {/* Sub-options for My Drive */}
              {item.subOptions && !isCollapsed && (
                <Collapsible expanded={isExpanded}>
                <div className="ml-4 mt-1 space-y-1">
                  {item.subOptions.map((subOption) => {
                    const SubIcon = subOption.icon;
                    const isSubActive = isActive && activeSubOption === subOption.id;

                    return (
                      <button
                        key={subOption.id}
                        onClick={() => {
                          setMode(item.id);
                          handleSubOptionClick(subOption.id);
                        }}
                        className={`w-full flex items-center gap-2 px-4 py-2 rounded-sm transition-all text-sm ${isSubActive
                            ? "bg-primary/5 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                      >
                        <SubIcon size={16} className="flex-shrink-0" />
                        <span>{subOption.label}</span>
                      </button>
                    );
                  })}
                </div>
                </Collapsible>
              )}

              {/* Bucket List for External Buckets */}
              {item.hasBuckets && !isCollapsed && (
                <Collapsible expanded={isExpanded}>
                <div className="ml-4 mt-1 space-y-1">
                  {/* Bucket List */}
                  {buckets.length > 0 && (
                    <div className="space-y-1">
                      {buckets.map((bucket) => {
                        const BucketIcon = providerIcons[bucket.provider];
                        const isBucketActive = isActive && activeBucketId === bucket.id;

                        return (
                          <div
                            key={bucket.id}
                            className={`flex items-center group rounded-sm transition-all ${
                              isBucketActive
                                ? "bg-primary/5"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <button
                              onClick={() => {
                                setMode(item.id);
                                onBucketSelect?.(bucket.id);
                              }}
                              className={`flex-1 flex items-center gap-2 px-4 py-2 transition-all text-sm ${
                                isBucketActive
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              title={bucket.name}
                            >
                              <BucketIcon size={14} className="flex-shrink-0" />
                              <span className="truncate">{bucket.name}</span>
                            </button>
                            <button
                              onClick={() => onEditBucket?.(bucket.id)}
                              className={`p-1.5 mr-1 rounded-sm transition-colors ${
                                isBucketActive
                                  ? "text-primary/70 hover:text-primary hover:bg-primary/10"
                                  : "text-muted-foreground hover:text-primary hover:bg-muted opacity-0 group-hover:opacity-100"
                              }`}
                              title="Bucket settings"
                            >
                              <MdSettings size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Bucket Button */}
                  <button
                    onClick={() => {
                      setMode(item.id);
                      onManageBuckets?.();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 rounded-sm transition-all text-sm text-muted-foreground hover:bg-muted/50 hover:text-primary"
                  >
                    <MdAdd size={16} className="flex-shrink-0" />
                    <span>Add Bucket</span>
                  </button>
                </div>
                </Collapsible>
              )}

              {/* S3 API Bucket List */}
              {item.hasS3ApiBuckets && !isCollapsed && (
                <Collapsible expanded={isExpanded}>
                <div className="ml-4 mt-1 space-y-1">
                  {/* S3 API Bucket List */}
                  {s3ApiBuckets.length > 0 && (
                    <div className="space-y-1">
                      {s3ApiBuckets.map((bucket) => {
                        const isBucketActive = isActive && activeS3ApiBucketId === bucket.id;

                        return (
                          <div
                            key={bucket.id}
                            className={`flex items-center group rounded-sm transition-all ${
                              isBucketActive
                                ? "bg-primary/5"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <button
                              onClick={() => {
                                setMode(item.id);
                                onS3ApiBucketSelect?.(bucket.id);
                              }}
                              className={`flex-1 flex items-center gap-2 px-4 py-2 transition-all text-sm ${
                                isBucketActive
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              title={`${bucket.name} (${bucket.storageUsedFormatted})`}
                            >
                              <MdOutlineStorage size={14} className="flex-shrink-0" />
                              <span className="truncate">{bucket.name}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Manage Credentials Button */}
                  <button
                    onClick={() => {
                      setMode(item.id);
                      onManageS3ApiCredentials?.();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 rounded-sm transition-all text-sm text-muted-foreground hover:bg-muted/50 hover:text-primary"
                  >
                    <MdOutlineKey size={16} className="flex-shrink-0" />
                    <span>Manage Keys</span>
                  </button>

                  {/* Create Bucket Button */}
                  <button
                    onClick={() => {
                      setMode(item.id);
                      onCreateS3ApiBucket?.();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 rounded-sm transition-all text-sm text-muted-foreground hover:bg-muted/50 hover:text-primary"
                  >
                    <MdAdd size={16} className="flex-shrink-0" />
                    <span>Create Bucket</span>
                  </button>
                </div>
                </Collapsible>
              )}

              {/* Team List for Teams */}
              {item.hasTeams && !isCollapsed && (
                <Collapsible expanded={isExpanded}>
                <div className="ml-4 mt-1 space-y-1">
                  {/* Team List */}
                  {teams.length > 0 && (
                    <div className="space-y-1">
                      {teams.map((team) => {
                        const isTeamActive = isActive && activeTeamId === team.id;

                        return (
                          <div
                            key={team.id}
                            className={`flex items-center group rounded-sm transition-all ${
                              isTeamActive
                                ? "bg-primary/5"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <button
                              onClick={() => {
                                setMode(item.id);
                                onTeamSelect?.(team.id);
                              }}
                              className={`flex-1 flex items-center gap-2 px-4 py-2 transition-all text-sm ${
                                isTeamActive
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              title={team.name}
                            >
                              <MdOutlineGroup size={14} className="flex-shrink-0" />
                              <span className="truncate">{team.name}</span>
                              {team.isOwner && (
                                <Crown size={12} className="text-warning flex-shrink-0" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Create Team Button */}
                  <button
                    onClick={() => {
                      setMode(item.id);
                      onCreateTeam?.();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 rounded-sm transition-all text-sm text-muted-foreground hover:bg-muted/50 hover:text-primary"
                  >
                    <MdAdd size={16} className="flex-shrink-0" />
                    <span>Create Team</span>
                  </button>
                </div>
                </Collapsible>
              )}
            </div>
          );
        })}
      </nav>

      {/* Feedback Button */}
      {onFeedbackClick && (
        <div className="px-3 pb-2">
          <button
            onClick={onFeedbackClick}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-2 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors`}
            title={isCollapsed ? "Feedback" : undefined}
          >
            <MdOutlineFeedback size={20} className="flex-shrink-0" />
            {!isCollapsed && <span className="text-sm">Feedback</span>}
          </button>
        </div>
      )}

      {/* Storage Indicator - show for cloud, s3api, and teams (all use same quota) */}
      {mode !== "dev" && !isCollapsed && storageLimit > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Storage</span>
              <span className="text-foreground font-medium">
                {formatFileSize(storageUsed)} of {formatFileSize(storageLimit)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${percentage > 90 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* User Profile */}
      {user && (
        <div className="p-3 border-t border-border" ref={profileMenuRef}>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-2 py-2 rounded-sm hover:bg-muted transition-colors group`}
              title={isCollapsed ? "Profile menu" : undefined}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                {user.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt={user.fullName || user.emailAddresses[0]?.emailAddress || "User"}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <span className="text-primary font-semibold text-sm">
                    {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0] || "U"}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.fullName || user.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.emailAddresses[0]?.emailAddress}
                  </p>
                </div>
              )}
            </button>

            {/* Dropdown Menu */}
            {showProfileMenu && (
              <div className={`absolute bottom-full mb-2 bg-card border border-border rounded-sm shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${isCollapsed ? 'left-0 w-48' : 'left-0 right-0'}`}>
                {/* Arrow indicator */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border rotate-45" />
              <button
                onClick={() => {
                  onProfileClick?.();
                  setShowProfileMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
              >
                <MdOutlinePerson size={18} className="text-muted-foreground flex-shrink-0" />
                <span>View Profile</span>
              </button>
              
              <button
                onClick={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  setShowProfileMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
              >
                {resolvedTheme === "dark" ? (
                  <MdOutlineLightMode size={18} className="text-muted-foreground flex-shrink-0" />
                ) : (
                  <MdOutlineDarkMode size={18} className="text-muted-foreground flex-shrink-0" />
                )}
                <span>Toggle Theme</span>
              </button>
              
              <div className="border-t border-border" />
              
              <button
                onClick={() => {
                  signOut();
                  setShowProfileMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
              >
                <MdOutlineLogout size={18} className="flex-shrink-0" />
                <span>Log Out</span>
              </button>
            </div>
          )}
          </div>
        </div>
      )}
    </aside>
  );
}

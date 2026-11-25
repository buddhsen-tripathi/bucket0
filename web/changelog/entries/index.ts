export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  month: string;
  day: string;
  year: string;
  title: string;
  category: string;
  description: string;
  features: string[];
}

export const entries: ChangelogEntry[] = [
  {
    id: "v1.4.0",
    version: "1.4.0",
    date: "May 29, 2026",
    month: "May",
    day: "29",
    year: "2026",
    title: "Faster Bug-Free Drive",
    category: "Improvement",
    description:
      "Speed and polish across the drive so it stays fast as your library grows.",
    features: [
      "Folders open quickly even with thousands of files",
      "Browse with numbered page navigation (25 or 100 per page)",
      "Collapsible sidebar sections",
      "New dedicated page for account deletion",
      "Various fixes to file actions and preview",
    ],
  },
  {
    id: "v1.3.0",
    version: "1.3.0",
    date: "April 9, 2026",
    month: "Apr",
    day: "09",
    year: "2026",
    title: "AgentBucket",
    category: "Feature",
    description:
      "Storage built for AI agents. Give them a key, they upload files into your account — you stay in control.",
    features: [
      "Create an API key for each agent and revoke anytime",
      "Choose where uploads land: AgentBucket for review or straight to My Drive",
      "Agents can create folders and organize their own work",
      "Browse, preview, and bulk-move files to your drive in one click",
      "Files stay isolated from My Drive until you decide to move them",
      "Built-in integration guide for AI agents and OpenClaw agents",
      "Available on all plans — uses your existing storage quota",
    ],
  },
  {
    id: "v1.2.1",
    version: "1.2.1",
    date: "April 2, 2026",
    month: "Apr",
    day: "02",
    year: "2026",
    title: "PDF Tools Addition",
    category: "Feature",
    description:
      "Our biggest tools release yet: a full in-browser PDF workspace is now live for all users with fast, private, no-upload processing.",
    features: [
      "Merge, split, and extract PDFs in seconds",
      "Protect and unlock documents with password controls",
      "Organize pages and add page numbers for polished output",
      "Sign, watermark, and redact files before sharing",
      "Fast private workflow: all edits run directly in your browser",
    ],
  },
  {
    id: "v1.2.0",
    version: "1.2.0",
    date: "March 5, 2026",
    month: "Mar",
    day: "05",
    year: "2026",
    title: "S3 API",
    category: "Feature",
    description:
      "Access your storage via S3-compatible tools.",
    features: [
      "S3-compatible API",
      "S3 API available on all plans",
      "Control download and save permissions on shared links",
      "Faster video seeking on large files",
      "Faster file uploads",
      "Improved file preview navigation",
    ],
  },
  {
    id: "v1.1.0",
    version: "1.1.0",
    date: "February 12, 2026",
    month: "Feb",
    day: "12",
    year: "2026",
    title: "Teams & New Plans",
    category: "Feature",
    description:
      "Work together with your team. Share files, track activity, and chat — all in one place.",
    features: [
      "Create a team and invite members via email",
      "Team storage is shared from your plan — no extra cost for members",
      "See who uploaded, deleted, or shared files in the activity feed",
      "Chat with your team directly within Bucket0",
      "Free tier now includes 5GB storage (up from 2GB)",
      "New plans: Starter (150GB), Pro (700GB), and Scale (2TB)",
      "Pay-as-you-go plan has been retired",
    ],
  },
  {
    id: "v1.0.1",
    version: "1.0.1",
    date: "January 27, 2026",
    month: "Jan",
    day: "27",
    year: "2026",
    title: "Streaming & Performance",
    category: "Improvement",
    description: "Large file uploads and faster streaming.",
    features: [
      "Upload files up to 15GB without browser timeouts",
      "Faster uploads with parallel chunk streaming",
      "Smoother video playback",
      "Paginated file listing for large collections",
    ],
  },
  {
    id: "v1.0.0",
    version: "1.0.0",
    date: "January 19, 2026",
    month: "Jan",
    day: "19",
    year: "2026",
    title: "Initial Release",
    category: "Launch",
    description: "Secure cloud storage with multi-bucket management and file sharing.",
    features: [
      "AES-256 encryption standard",
      "Connect external S3-compatible buckets",
      "Credentials stay in your browser or encrypted at rest",
      "Share files publicly or restrict to Bucket0 users",
      "Preview PDFs, images, and videos in-browser",
      "Free, Pro, and Pay-as-you-go plans",
    ],
  },
];

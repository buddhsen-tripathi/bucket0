// Copy for the /agentbucket page, shared with its Markdown version (lib/agent-discovery/markdown.ts) and FAQ schema.
// Facts: plan limits in lib/payments/plans.ts; routes in server/routes/api/agent-bucket; MCP sign-in mints a b0ak_ key
// on the same account (lib/oauth/bridge.ts), so connectors and API keys share one Agent Storage.

export const AGENTBUCKET_TITLE = "Persistent File Storage for AI Agents | AgentBucket by Bucket0";
export const AGENTBUCKET_DESCRIPTION =
  "Give AI agents a file store that lasts across sessions, apps and conversations. Save, list and share files over MCP or a REST API, with semantic search from the Starter plan.";

export const AGENTBUCKET_STEPS = [
  {
    title: "Connect",
    body: "Add https://mcp.bucket0.com/mcp as a connector in Claude, ChatGPT or Cursor and sign in, or create an API key (b0ak_…) for your own code.",
  },
  {
    title: "Save",
    body: "The agent uploads reports, notes, data and code to its Agent Storage. Text files are indexed for search as they arrive.",
  },
  {
    title: "Find",
    body: "In a later session, the agent lists its files or searches them by meaning and reads back the passage it needs.",
  },
  {
    title: "Hand off",
    body: "Share a file by link, or set a key to write straight into a folder of your drive so people see the results where they already work.",
  },
];

export const AGENTBUCKET_COMPARISON = [
  {
    need: "Connect an assistant",
    agentbucket: "MCP connector with sign-in, or a Bearer key",
    objectStore: "Run or install an MCP server and manage access keys",
  },
  {
    need: "Find files later",
    agentbucket: "List by folder, or search text by meaning (Starter and up)",
    objectStore: "List by prefix; search needs a separate index or vector database",
  },
  {
    need: "Share with a person",
    agentbucket: "One call returns a share link",
    objectStore: "Presigned URLs that expire, or a public bucket policy",
  },
  {
    need: "Review what agents saved",
    agentbucket: "Files appear in the Bucket0 dashboard or a drive folder",
    objectStore: "Cloud console or a separate tool",
  },
  {
    need: "Scale and control",
    agentbucket: "Up to 2 TB per account, managed for you",
    objectStore: "Practically unlimited, with regions, IAM and lifecycle rules",
  },
];

export const AGENTBUCKET_FAQ = [
  {
    question: "How can AI agents keep files between sessions?",
    answer:
      "Give the agent storage that lives outside the session. With AgentBucket, the agent saves files over MCP or the REST API, and a later session lists or searches them. Files stay in your Bucket0 account until you or the agent delete them.",
  },
  {
    question: "Which MCP server gives Claude persistent file storage?",
    answer:
      "Add https://mcp.bucket0.com/mcp as a custom connector and sign in with your Bucket0 account. Claude can then upload, download, list and share files and search agent memory in any later conversation.",
  },
  {
    question: "Can Claude, ChatGPT and Cursor share the same files?",
    answer:
      "Yes, when they are connected to the same Bucket0 account. Every connector and API key on an account reads and writes the same Agent Storage, so one agent can pick up what another saved.",
  },
  {
    question: "Is AgentBucket a vector database?",
    answer:
      "No. It stores ordinary files. On Starter and above, text files are also split into chunks and indexed, so agents can search them by meaning and get back the passage, the file and a score. PDFs, images and other binary files are stored but not indexed.",
  },
  {
    question: "Can I keep a file out of search?",
    answer: "Yes. Send index=false with the upload and the file is stored without being indexed.",
  },
  {
    question: "How much does AgentBucket cost?",
    answer:
      "AgentBucket is included in every plan. Free has 5 GB and one agent key. Memory search starts on Starter at $5 a month billed annually, with 10,000 chunks; Pro has 50,000 and Scale 200,000.",
  },
  {
    question: "Are my files used to train AI models?",
    answer: "No. Files are encrypted at rest and are never used to train AI models.",
  },
  {
    question: "Can I run AgentBucket myself?",
    answer:
      "Bucket0 is open source under AGPL-3.0 and runs on Cloudflare Workers. The code is at https://github.com/buddhsen-tripathi/bucket0.",
  },
];

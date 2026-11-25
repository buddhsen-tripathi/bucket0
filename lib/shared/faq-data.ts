export const faqCategories = [
  {
    title: "Getting Started",
    questions: [
      {
        question: "How do I connect my S3 bucket?",
        answer:
          "Simply go to the dashboard, click 'Add Bucket', and enter your S3 credentials. Your credentials are encrypted at rest and never leave the server.",
      },
      {
        question: "What's the difference between Free and paid plans?",
        answer:
          "Free gives you 5 GB of encrypted storage with file uploads, S3 API access, file sharing, and 1 external bucket connection. Paid plans add more storage, higher bucket and API limits, and teams from Starter onward with no per-seat fees.",
      },
      {
        question: "Do I pay extra for teams or the S3 API?",
        answer:
          "No. S3 API, external buckets, and AgentBucket are included with plan-specific limits. Teams start on Starter; members share the owner's storage quota instead of being billed per seat.",
      },
      {
        question: "Can I mix my own buckets with Bucket0 storage?",
        answer:
          "Yes! All plans let you connect external S3-compatible buckets alongside Bucket0's managed encrypted storage.",
      },
      {
        question: "What is S3 API access?",
        answer:
          "S3 API lets you access your Bucket0 storage using standard S3-compatible tools like AWS CLI, SDKs, and apps like Cyberduck. Free plan includes 1 bucket, paid plans get up to 100 buckets.",
      },
      {
        question: "What is AgentBucket+?",
        answer:
          "AgentBucket is storage built for AI agents: they save, list, read, and delete files through a simple API or one-click MCP connector. On paid plans it becomes AgentBucket+, where files are automatically indexed so agents recall them by meaning across sessions, not just by filename.",
      },
    ],
  },
  {
    title: "Security & Privacy",
    questions: [
      {
        question: "Will my data be used to train AI models?",
        answer:
          "No. We guarantee that your data will never be used to train AI models. Your files are yours alone.",
      },
      {
        question: "How are my credentials stored?",
        answer:
          "Your S3 credentials are encrypted at rest using AES-256-GCM before being stored in our database. They are only decrypted server-side when needed for operations.",
      },
      {
        question: "Is my data encrypted?",
        answer:
          "Yes. All files stored on Bucket0 are encrypted with AES-256 before being stored. Data in transit is protected with TLS 1.3.",
      },
    ],
  },
  {
    title: "Billing & Plans",
    questions: [
      {
        question: "What plans does Bucket0 offer?",
        answer:
          "We offer four plans: Free (5 GB, 1 S3 API bucket), Starter ($7/mo or $5/mo annual with 150 GB, 10 buckets), Pro ($19/mo or $15/mo annual with 700 GB, 50 buckets), and Scale ($45/mo or $35/mo annual with 2 TB, 100 buckets).",
      },
      {
        question: "Are teams included on the free plan?",
        answer:
          "No. Teams start on the Starter plan. When you upgrade, members share your storage quota with no per-seat fees. Pro and Scale plans also include team chat.",
      },
      {
        question: "How do teams work?",
        answer:
          "You can create teams and invite members to collaborate on shared files. Team storage comes from the owner's plan quota. There are no per-seat charges. Pro and Scale plans also include team chat.",
      },
      {
        question: "Do you offer annual billing discounts?",
        answer:
          "Yes, annual billing saves you roughly 20% compared to monthly billing. You can switch between billing periods at any time.",
      },
    ],
  },
];

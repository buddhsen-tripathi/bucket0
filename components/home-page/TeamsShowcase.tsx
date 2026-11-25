
import { motion, cubicBezier } from "framer-motion";
import {
  Users,
  FolderOpen,
  Activity,
  MessageSquare,
  Upload,
  Download,
  Trash2,
  Share2,
  Crown,
  ArrowUpRight,
  Check,
} from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: cubicBezier(0.4, 0, 0.2, 1),
    },
  },
};

export default function TeamsShowcase() {
  return (
    <section className="py-32 bg-background relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="max-w-7xl mx-auto px-6 relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Team cloud storage
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Shared storage for people working together. Permissions, activity, and chat start on Starter, with no per-seat fees.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
        >
          {/* Card 1: Shared Files - Large */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-2 group"
          >
            <div className="h-full bg-card border border-border rounded-sm p-6 lg:p-8 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1">Shared Files</h3>
                    <p className="text-sm text-muted-foreground">One place for all team files</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>

                {/* File list mockup */}
                <div className="space-y-2">
                  {[
                    { name: "Q4 Report.pdf", size: "2.4 MB", user: "SC", color: "bg-blue-500" },
                    { name: "Brand Assets/", size: "24 items", user: "MJ", color: "bg-emerald-500" },
                    { name: "Product Demo.mp4", size: "148 MB", user: "You", color: "bg-primary" },
                  ].map((file, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="flex items-center justify-between p-3 rounded-sm bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                          <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{file.size}</p>
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full ${file.color} flex items-center justify-center`}>
                        <span className="text-[10px] font-semibold text-white">
                          {file.user === "You" ? "Y" : file.user}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Team Members */}
          <motion.div variants={itemVariants} className="group">
            <div className="h-full bg-card border border-border rounded-sm p-6 lg:p-8 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1">Permissions</h3>
                    <p className="text-sm text-muted-foreground">Fine-grained access control</p>
                  </div>
                </div>

                {/* Member avatars with permissions */}
                <div className="space-y-2">
                  {[
                    { name: "You", role: "Owner", perms: ["upload", "download", "delete", "share"], isOwner: true },
                    { name: "Sarah", role: "Editor", perms: ["upload", "download", "share"], isOwner: false },
                    { name: "Mike", role: "Viewer", perms: ["download"], isOwner: false },
                  ].map((member, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center relative">
                          <span className="text-xs font-medium text-primary">{member.name[0]}</span>
                          {member.isOwner && (
                            <Crown className="w-3 h-3 text-yellow-500 absolute -top-1 -right-1" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-[10px] text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                      <div className="flex gap-0.5">
                        {[
                          { key: "upload", Icon: Upload },
                          { key: "download", Icon: Download },
                          { key: "delete", Icon: Trash2 },
                          { key: "share", Icon: Share2 },
                        ].map(({ key, Icon }) => (
                          <div
                            key={key}
                            className={`w-5 h-5 rounded flex items-center justify-center ${
                              member.perms.includes(key)
                                ? "bg-primary/10 text-primary"
                                : "bg-muted/50 text-muted-foreground/30"
                            }`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Activity Feed */}
          <motion.div variants={itemVariants} className="group">
            <div className="h-full bg-card border border-border rounded-sm p-6 lg:p-8 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Activity className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1">Activity</h3>
                    <p className="text-sm text-muted-foreground">See who did what, when</p>
                  </div>
                </div>

                {/* Activity items */}
                <div className="space-y-2">
                  {[
                    { user: "Sarah", action: "uploaded", file: "Q4 Report.pdf", time: "2h ago", dot: "bg-emerald-500" },
                    { user: "Mike", action: "viewed", file: "Brand Assets/", time: "5h ago", dot: "bg-blue-500" },
                    { user: "You", action: "shared", file: "Demo.mp4", time: "1d ago", dot: "bg-primary" },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="flex items-start gap-3"
                    >
                      <div className={`w-2 h-2 rounded-full ${item.dot} mt-1.5 flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          <span className="font-medium">{item.user}</span>{" "}
                          <span className="text-muted-foreground">{item.action}</span>{" "}
                          <span className="font-medium">{item.file}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">{item.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Team Chat - Wide */}
          <motion.div variants={itemVariants} className="lg:col-span-2 group">
            <div className="h-full bg-card border border-border rounded-sm p-6 lg:p-8 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1">Team Chat</h3>
                    <p className="text-sm text-muted-foreground">Discuss without leaving Bucket0</p>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    Pro & Scale
                  </span>
                </div>

                {/* Chat mockup */}
                <div className="space-y-2">
                  {[
                    { user: "Sarah", message: "Just uploaded the Q4 report. Can you review?", time: "2:34 PM", isYou: false },
                    { user: "You", message: "Looking at it now. Looks good!", time: "2:41 PM", isYou: true },
                  ].map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.15 }}
                      className={`flex gap-3 ${msg.isYou ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.isYou ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <span className="text-[10px] font-medium">{msg.user[0]}</span>
                      </div>
                      <div className={`max-w-[70%] ${msg.isYou ? "text-right" : ""}`}>
                        <div className={`inline-block px-3 py-2 rounded-2xl text-sm ${
                          msg.isYou
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted text-foreground rounded-bl-md"
                        }`}>
                          {msg.message}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{msg.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Input mockup */}
                <div className="mt-4 flex items-center gap-2 p-2 rounded-sm bg-muted/40 border border-border">
                  <div className="flex-1 px-2 text-sm text-muted-foreground">Type a message...</div>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Bottom features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground"
        >
          {[
            "No extra cost for members",
            "Storage shared from your plan",
            "Invite via email",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}


import React from "react";
import { MdClose, MdCloud, MdDevices, MdLock, MdSync } from "react-icons/md";

interface StoragePreferenceProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreference: "local" | "cloud";
  onSelect: (pref: "local" | "cloud") => void;
}

export default function StoragePreference({
  isOpen,
  onClose,
  currentPreference,
  onSelect,
}: StoragePreferenceProps) {
  if (!isOpen) return null;

  const handleSelect = (pref: "local" | "cloud") => {
    onSelect(pref);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-sm shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Storage Preference</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-sm transition-colors"
          >
            <MdClose size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose where to store your S3 bucket credentials:
          </p>

          {/* Cloud Option */}
          <button
            onClick={() => handleSelect("cloud")}
            className={`w-full p-4 border rounded-sm text-left transition-all ${
              currentPreference === "cloud"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MdCloud size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Cloud Storage</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Credentials are encrypted and stored on our servers. Access your buckets from any device.
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MdLock size={12} /> AES-256 encrypted
                  </span>
                  <span className="flex items-center gap-1">
                    <MdSync size={12} /> Syncs across devices
                  </span>
                </div>
              </div>
            </div>
          </button>

          {/* Local Option */}
          <button
            onClick={() => handleSelect("local")}
            className={`w-full p-4 border rounded-sm text-left transition-all ${
              currentPreference === "local"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                <MdDevices size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Local Browser</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Credentials are encrypted and stored locally. They never leave your device.
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MdLock size={12} /> Encrypted localStorage
                  </span>
                  <span className="flex items-center gap-1">
                    <MdDevices size={12} /> This device only
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

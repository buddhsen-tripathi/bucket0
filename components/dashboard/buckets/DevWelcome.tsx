import { MdAdd, MdOutlineStorage, MdCloud, MdDevices } from "react-icons/md";
import { SiCloudflare, SiDigitalocean, SiBackblaze } from "react-icons/si";
import { TbBrandAzure } from "react-icons/tb";
import { FaAws } from "react-icons/fa6";

interface DevWelcomeProps {
  onConfigure: () => void;
  storagePreference?: "local" | "cloud";
}

export default function DevWelcome({ onConfigure, storagePreference = "cloud" }: DevWelcomeProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-lg w-full bg-card border border-border rounded-sm p-8 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <MdOutlineStorage size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-3">
          Connect Your Storage
        </h2>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Connect to AWS S3, Cloudflare R2, or any S3-compatible storage provider to start managing your files with Bucket0.
        </p>

        <div className="bg-muted/30 border border-border rounded-sm p-5 mb-8">
          <p className="text-sm text-foreground font-medium mb-3">Supported Providers</p>
          <div className="flex justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <FaAws size={28} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">AWS S3</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SiCloudflare size={28} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">R2</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <TbBrandAzure size={28} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Azure</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SiDigitalocean size={28} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Spaces</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SiBackblaze size={28} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">B2</span>
            </div>
          </div>
        </div>

        <button
          onClick={onConfigure}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors font-medium shadow-sm"
        >
          <MdAdd size={20} />
          <span>Connect Your First Bucket</span>
        </button>

        <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
          {storagePreference === "cloud" ? (
            <>
              <MdCloud size={14} />
              <span>Credentials encrypted and stored on our servers</span>
            </>
          ) : (
            <>
              <MdDevices size={14} />
              <span>Credentials encrypted and stored in your browser</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

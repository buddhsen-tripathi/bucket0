
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MdOutlineUploadFile, MdOutlineCreateNewFolder, MdOutlineDriveFolderUpload } from "react-icons/md";

interface NewButtonProps {
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  disabled?: boolean;
}

export default function NewButton({
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  disabled = false,
}: NewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", () => setIsOpen(false), true);
      window.addEventListener("resize", () => setIsOpen(false));
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", () => setIsOpen(false), true);
      window.removeEventListener("resize", () => setIsOpen(false));
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const menuItems = [
    { label: "Upload files", icon: MdOutlineUploadFile, action: onUploadFiles },
    { label: "Upload folder", icon: MdOutlineDriveFolderUpload, action: onUploadFolder },
    { label: "New folder", icon: MdOutlineCreateNewFolder, action: onCreateFolder },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className="flex items-center gap-2 px-4 h-[42px] bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm transition-all font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="hidden lg:inline">{typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "Upload (⌘+U)" : "Upload (Ctrl+U)"}</span>
        <span className="lg:hidden">Upload</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left }}
          className="w-56 bg-card border border-border rounded-sm shadow-xl overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-100"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={index}
                onClick={() => {
                  item.action();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
              >
                <Icon size={18} className="text-muted-foreground flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

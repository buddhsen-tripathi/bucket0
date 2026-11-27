import {
  Merge,
  Split,
  ArrowDownUp,
  FileOutput,
  FileImage,
  Hash,
  Droplets,
  Lock,
  Unlock,
  EyeOff,
  PenLine,
  Layers,
  Highlighter,
  ScanText,
  RefreshCw,
  Scaling,
  Crop,
  RotateCw,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  type LucideIcon,
} from "lucide-react";

export type ToolCategory = "all" | "organize" | "convert" | "edit" | "security" | "image";

export type ToolType = "pdf" | "image";

export interface Tool {
  name: string;
  slug: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  colorClass: string;
  iconBgClass: string;
  type?: ToolType;
}

/** @deprecated Use `Tool` instead */
export type PdfTool = Tool;

export const PDF_TOOLS: PdfTool[] = [
  {
    name: "Merge PDF",
    slug: "merge",
    description:
      "Combine multiple PDF files into a single document in your preferred order.",
    icon: Merge,
    category: "organize",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Split PDF",
    slug: "split",
    description:
      "Separate a PDF into individual pages or custom page ranges.",
    icon: Split,
    category: "organize",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Extract Pages",
    slug: "extract",
    description:
      "Extract specific pages from a PDF to create a new document.",
    icon: FileOutput,
    category: "organize",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Organize PDF",
    slug: "organize",
    description:
      "Reorder, remove, or rearrange pages in your PDF with drag and drop.",
    icon: ArrowDownUp,
    category: "organize",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "JPG to PDF",
    slug: "jpg-to-pdf",
    description:
      "Convert JPG, PNG, or WebP images into a single PDF document.",
    icon: FileImage,
    category: "convert",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Page Numbers",
    slug: "page-numbers",
    description:
      "Add page numbers to your PDF with customizable position and format.",
    icon: Hash,
    category: "edit",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Watermark",
    slug: "watermark",
    description:
      "Add a text watermark to every page of your PDF with custom styling.",
    icon: Droplets,
    category: "edit",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Protect PDF",
    slug: "protect",
    description:
      "Add password protection to your PDF to restrict unauthorized access.",
    icon: Lock,
    category: "security",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Unlock PDF",
    slug: "unlock",
    description:
      "Remove password protection from a PDF by entering the document password.",
    icon: Unlock,
    category: "security",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Redact PDF",
    slug: "redact",
    description:
      "Permanently black out sensitive text and areas in your PDF document.",
    icon: EyeOff,
    category: "security",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Flatten PDF",
    slug: "flatten",
    description:
      "Flatten forms and annotations into a static PDF for reliable sharing.",
    icon: Layers,
    category: "edit",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Annotate PDF",
    slug: "annotate",
    description:
      "Add highlights and inline text comments directly onto your PDF pages.",
    icon: Highlighter,
    category: "edit",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "OCR PDF",
    slug: "ocr",
    description:
      "Run OCR in your browser to make scanned PDFs text-searchable.",
    icon: ScanText,
    category: "convert",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    name: "Sign PDF",
    slug: "sign",
    description:
      "Add your signature to a PDF by drawing, typing, or uploading an image.",
    icon: PenLine,
    category: "edit",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
];

export const IMAGE_TOOLS: PdfTool[] = [
  {
    name: "Convert Image",
    slug: "convert-image",
    description:
      "Convert images between PNG, JPG, WebP, AVIF and BMP.",
    icon: RefreshCw,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Resize Image",
    slug: "resize-image",
    description:
      "Resize images by pixels or percentage while preserving aspect ratio.",
    icon: Scaling,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Crop Image",
    slug: "crop-image",
    description:
      "Crop images with preset aspect ratios or freeform selection.",
    icon: Crop,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Rotate & Flip",
    slug: "rotate-image",
    description:
      "Rotate images 90/180/270 degrees or flip horizontally and vertically.",
    icon: RotateCw,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Compress Image",
    slug: "compress-image",
    description:
      "Reduce image file size with an adjustable quality slider and live preview.",
    icon: Minimize2,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Image Filters",
    slug: "filter-image",
    description:
      "Adjust brightness, contrast, saturation, blur, and apply effects like grayscale and sepia.",
    icon: SlidersHorizontal,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Reduce Image Noise",
    slug: "reduce-image-noise",
    description:
      "Denoise grainy images and restore clarity with edge-aware smoothing.",
    icon: Sparkles,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
  {
    name: "Watermark Image",
    slug: "watermark-image",
    description:
      "Add a text watermark to your image with custom position, size, color, and opacity.",
    icon: Stamp,
    category: "image",
    colorClass: "text-primary",
    iconBgClass: "bg-primary/10",
    type: "image",
  },
];

export const ALL_TOOLS: PdfTool[] = [...PDF_TOOLS, ...IMAGE_TOOLS];

export const TOOL_CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "organize", label: "Organize PDF" },
  { id: "convert", label: "Convert PDF" },
  { id: "edit", label: "Edit PDF" },
  { id: "security", label: "PDF Security" },
  { id: "image", label: "Image Tools" },
];

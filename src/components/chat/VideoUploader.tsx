import { useRef, useState } from "react";
import { Upload, X, Film, Music, Image, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  file: File;
  type: "footage" | "music" | "reference";
  preview?: string;
  r2FileId?: string;
  uploadProgress?: number;
}

interface VideoUploaderProps {
  onFilesChange: (files: UploadedFile[]) => void;
  /** Called when user submits a URL (YouTube or direct) as a reference */
  onYouTubeUrl?: (url: string) => void;
  disabled?: boolean;
}

function defaultType(file: File): UploadedFile["type"] | null {
  if (file.type.startsWith("video/")) return "footage";
  if (file.type.startsWith("audio/")) return "music";
  if (file.type.startsWith("image/")) return "reference";
  return null;
}

const TYPE_LABEL: Record<UploadedFile["type"], string> = {
  footage: "Footage",
  music: "Music",
  reference: "Reference",
};

const TYPE_COLOR: Record<UploadedFile["type"], string> = {
  footage: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  music: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
  reference: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
};

export function VideoUploader({ onFilesChange, onYouTubeUrl, disabled }: VideoUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addRawFiles = (rawFiles: File[]) => {
    if (disabled) return;
    const added: UploadedFile[] = [];
    for (const file of rawFiles) {
      const type = defaultType(file);
      if (!type) continue;
      const preview =
        file.type.startsWith("video/") || file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
      added.push({ id: crypto.randomUUID(), file, type, preview });
    }
    if (added.length === 0) return;
    const updated = [...files, ...added];
    setFiles(updated);
    onFilesChange(updated);
  };

  const setType = (id: string, type: UploadedFile["type"]) => {
    const updated = files.map((f) => (f.id === id ? { ...f, type } : f));
    setFiles(updated);
    onFilesChange(updated);
  };

  const removeFile = (id: string) => {
    const removed = files.find((f) => f.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    onFilesChange(updated);
  };

  const submitUrl = () => {
    const url = urlDraft.trim();
    if (!url || !onYouTubeUrl) return;
    onYouTubeUrl(url);
    setUrlDraft("");
    setShowUrl(false);
  };

  const counts = { footage: 0, music: 0, reference: 0 };
  for (const f of files) counts[f.type]++;

  const summary = [
    counts.footage > 0 && `${counts.footage} clip${counts.footage !== 1 ? "s" : ""}`,
    counts.music > 0 && `${counts.music} music`,
    counts.reference > 0 && `${counts.reference} reference`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addRawFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => {
          if (disabled) return;
          fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload files"
        className={cn(
          "rounded-lg border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-card/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 gap-3",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">
              {summary || "Drop footage, music, images here"}
            </span>
            {summary && (
              <span className="text-xs text-muted-foreground/60">· add more</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onYouTubeUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowUrl((v) => !v);
                }}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-1 text-xs border rounded px-2 py-1 transition-colors",
                  showUrl
                    ? "border-primary/50 text-primary bg-primary/5"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <Link className="h-3 w-3" />
                URL
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={(e) => addRawFiles(Array.from(e.target.files ?? []))}
          disabled={disabled}
          className="hidden"
        />
      </div>

      {/* URL input row */}
      {showUrl && (
        <div className="flex gap-2">
          <input
            type="url"
            value={urlDraft}
            autoFocus
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitUrl();
              }
              if (e.key === "Escape") setShowUrl(false);
            }}
            placeholder="YouTube URL, Vimeo, or direct video link…"
            className="flex-1 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors min-w-0"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={submitUrl}
            disabled={!urlDraft.trim() || disabled}
            className="text-xs h-8 shrink-0"
          >
            Analyze
          </Button>
          <button
            onClick={() => setShowUrl(false)}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onTypeChange={(t) => setType(file.id, t)}
              onRemove={() => removeFile(file.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({
  file,
  onTypeChange,
  onRemove,
  disabled,
}: {
  file: UploadedFile;
  onTypeChange: (type: UploadedFile["type"]) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isVideo = file.file.type.startsWith("video/");
  const isAudio = file.file.type.startsWith("audio/");
  const isImage = file.file.type.startsWith("image/");
  const sizeStr = (file.file.size / 1024 / 1024).toFixed(1) + " MB";

  // Only video files can switch between footage and reference
  const switchableTypes: UploadedFile["type"][] = isVideo
    ? ["footage", "reference"]
    : [];

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      {/* Thumbnail */}
      <div className="h-8 w-12 shrink-0 rounded overflow-hidden bg-secondary flex items-center justify-center">
        {file.preview && isImage ? (
          <img src={file.preview} alt="" className="h-full w-full object-cover" />
        ) : file.preview && isVideo ? (
          <video src={file.preview} className="h-full w-full object-cover" muted playsInline />
        ) : isAudio ? (
          <Music className="h-3.5 w-3.5 text-purple-500" />
        ) : (
          <Film className="h-3.5 w-3.5 text-blue-500" />
        )}
      </div>

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate leading-tight">{file.file.name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">{sizeStr}</p>
      </div>

      {/* Type selector — toggle for video, static pill for audio/image */}
      {switchableTypes.length > 1 ? (
        <div className="flex shrink-0 rounded-full border border-border overflow-hidden">
          {switchableTypes.map((t) => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              disabled={disabled}
              className={cn(
                "px-2.5 py-0.5 text-[10px] font-medium transition-colors leading-none",
                file.type === t
                  ? TYPE_COLOR[t]
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      ) : (
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium leading-none",
            TYPE_COLOR[file.type]
          )}
        >
          {TYPE_LABEL[file.type]}
        </span>
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground transition-colors disabled:opacity-30 ml-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

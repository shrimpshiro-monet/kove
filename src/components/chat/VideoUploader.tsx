import { useCallback, useState } from "react";
import { Upload, X, Film, Music, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  file: File;
  type: "footage" | "music" | "reference";
  preview?: string;
}

interface VideoUploaderProps {
  onFilesChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

export function VideoUploader({ onFilesChange, disabled }: VideoUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      processFiles(droppedFiles);
    },
    [disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const selectedFiles = Array.from(e.target.files || []);
      processFiles(selectedFiles);
    },
    [disabled]
  );

  const processFiles = (newFiles: File[]) => {
    const uploaded: UploadedFile[] = [];

    for (const file of newFiles) {
      const type = detectFileType(file);
      if (!type) continue; // Skip unsupported files

      const uploadedFile: UploadedFile = {
        id: crypto.randomUUID(),
        file,
        type,
      };

      // Generate preview for videos
      if (type === "footage" || type === "reference") {
        const url = URL.createObjectURL(file);
        uploadedFile.preview = url;
      }

      uploaded.push(uploadedFile);
    }

    const updated = [...files, ...uploaded];
    setFiles(updated);
    onFilesChange(updated);
  };

  const detectFileType = (file: File): "footage" | "music" | "reference" | null => {
    if (file.type.startsWith("video/")) {
      // For MVP: all videos are footage (reference detection can be added later)
      return "footage";
    }
    if (file.type.startsWith("audio/")) {
      return "music";
    }
    return null;
  };

  const removeFile = (id: string) => {
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    onFilesChange(updated);

    // Revoke preview URLs
    const removed = files.find((f) => f.id === id);
    if (removed?.preview) {
      URL.revokeObjectURL(removed.preview);
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 bg-card/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <label
          className={cn(
            "flex flex-col items-center justify-center py-8 px-4 cursor-pointer",
            disabled && "cursor-not-allowed"
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-foreground mb-1">
            Drop footage or music here
          </p>
          <p className="text-xs text-muted-foreground">
            MP4, MOV, MP3 (up to 500MB each)
          </p>
          <input
            type="file"
            multiple
            accept="video/*,audio/*"
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </div>

      {/* Uploaded files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <FilePreview
              key={file.id}
              file={file}
              onRemove={() => removeFile(file.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilePreview({
  file,
  onRemove,
  disabled,
}: {
  file: UploadedFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const icon =
    file.type === "music" ? (
      <Music className="h-4 w-4" />
    ) : file.type === "reference" ? (
      <Image className="h-4 w-4" />
    ) : (
      <Film className="h-4 w-4" />
    );

  const sizeStr = (file.file.size / 1024 / 1024).toFixed(1) + "MB";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{file.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {file.type} • {sizeStr}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

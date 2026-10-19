"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { put } from "@vercel/blob/client";
import { Crop, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { useTRPCClient } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { ImageCropper } from "./image-cropper";

type Props = {
  stadiumSlug: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Every finished upload, so the editor can delete the ones that end up unused. */
  onUploaded: (url: string) => void;
  onBusy: (busy: boolean) => void;
};

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
/** Before cropping. The cropped result is far smaller. */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

type Source = { url: string; name: string };

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/-[A-Za-z0-9]{20,}$/, "") || "product";
}

export function ImageField({ stadiumSlug, value, onChange, onUploaded, onBusy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const client = useTRPCClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  /** The uncropped photo picked this session, so Adjust can re-crop from the full frame. */
  const [source, setSource] = useState<Source | null>(null);
  const [cropping, setCropping] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  async function upload(photo: Blob, name: string) {
    setError(null);
    setProgress(0);
    onBusy(true);
    try {
      const ext = photo.type === "image/webp" ? "webp" : "jpg";
      const file = new File([photo], `${baseName(name)}.${ext}`, { type: photo.type });
      const grant = await client.products.uploadToken.mutate({ stadium: stadiumSlug, filename: file.name, contentType: file.type });
      if (!grant.ok) {
        setError(grant.error);
        return;
      }
      const blob = await put(grant.pathname, file, {
        access: "public",
        token: grant.token,
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      onUploaded(blob.url);
      onChange(blob.url);
    } catch {
      setError("The upload didn’t go through. Check the connection and try again.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) {
      setError("Use a JPG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That image is over 30 MB. Pick a smaller one.");
      return;
    }
    setSource({ url: URL.createObjectURL(file), name: file.name });
    startCrop();
  }

  function startCrop() {
    setCropping(true);
    onBusy(true);
  }

  /** Re-crop the current photo. Uses the original file when it was picked this session. */
  async function adjust() {
    if (source) {
      startCrop();
      return;
    }
    if (!value) return;
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setSource({ url: URL.createObjectURL(blob), name: new URL(value).pathname.split("/").pop() ?? "product" });
      startCrop();
    } catch {
      setError("Couldn’t open this photo for editing. Upload it again instead.");
    } finally {
      setOpening(false);
    }
  }

  const uploading = progress !== null;
  const busy = uploading || opening;

  if (cropping && source) {
    return (
      <ImageCropper
        src={source.url}
        onCancel={() => {
          setCropping(false);
          onBusy(false);
        }}
        onConfirm={(photo) => {
          setCropping(false);
          void upload(photo, source.name);
        }}
      />
    );
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative aspect-[3/2] w-40 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-photo">
            <Image src={value} alt="Product photo" fill sizes="160px" className="object-contain" />
            {uploading ? <UploadVeil progress={progress} /> : null}
          </div>
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => void adjust()}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-neutral-50! disabled:opacity-50"
            >
              {opening ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Crop className="size-3.5" aria-hidden />}
              Crop
            </button>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 disabled:opacity-50"
            >
              <Upload className="size-3.5" aria-hidden />
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(null);
                onChange(null);
              }}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          disabled={uploading}
          className={cn(
            "relative flex h-32 w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-500",
            over ? "border-blue-500 bg-blue-50!" : "border-neutral-300 bg-neutral-50! hover:bg-neutral-100!",
          )}
        >
          {uploading ? (
            <UploadVeil progress={progress} />
          ) : (
            <>
              <ImagePlus className="size-5 text-neutral-400" aria-hidden />
              <span className="text-[14px] font-medium">Drop a photo or click to upload</span>
              <span className="text-[12px] text-neutral-500">JPG, PNG or WebP. You’ll crop it to 3:2 next.</span>
            </>
          )}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UploadVeil({ progress }: { progress: number | null }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/85 text-[13px] font-medium text-neutral-700">
      <Loader2 className="size-4 animate-spin text-neutral-500" aria-hidden />
      Uploading{progress ? ` ${Math.round(progress)}%` : "…"}
      <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full bg-neutral-900 transition-[width] duration-150" style={{ width: `${progress ?? 0}%` }} />
      </span>
    </span>
  );
}

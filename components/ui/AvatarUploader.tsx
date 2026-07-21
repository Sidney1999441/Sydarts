"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type AvatarEntityType = "profile" | "saved_team" | "tournament_team";

type AvatarUploaderProps = {
  entityType: AvatarEntityType;
  entityId: string;
  initialUrl?: string | null;
  fallback: string;
  label?: string;
  size?: "sm" | "md" | "lg";
};

type ImageMeta = {
  url: string;
  width: number;
  height: number;
};

const outputSize = 512;
const previewSize = 288;
const maxSourceSize = 8 * 1024 * 1024;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampOffset(meta: ImageMeta, zoom: number, nextOffset: { x: number; y: number }) {
  const baseScale = Math.max(previewSize / meta.width, previewSize / meta.height);
  const scale = baseScale * zoom;
  const renderedWidth = meta.width * scale;
  const renderedHeight = meta.height * scale;
  const maxX = Math.max(0, (renderedWidth - previewSize) / 2);
  const maxY = Math.max(0, (renderedHeight - previewSize) / 2);

  return {
    x: clamp(nextOffset.x, -maxX, maxX),
    y: clamp(nextOffset.y, -maxY, maxY)
  };
}

function avatarInitial(text: string) {
  return (text || "A").trim().slice(0, 1).toUpperCase();
}

export function AvatarUploader({
  entityType,
  entityId,
  initialUrl,
  fallback,
  label = "更换头像",
  size = "md"
}: AvatarUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialUrl || "");
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setAvatarUrl(initialUrl || "");
  }, [initialUrl]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const imageStyle = useMemo(() => {
    if (!imageMeta) return {};
    const baseScale = Math.max(previewSize / imageMeta.width, previewSize / imageMeta.height);
    const scale = baseScale * zoom;
    const width = imageMeta.width * scale;
    const height = imageMeta.height * scale;
    return {
      width,
      height,
      left: (previewSize - width) / 2 + offset.x,
      top: (previewSize - height) / 2 + offset.y
    };
  }, [imageMeta, offset.x, offset.y, zoom]);

  function resetDialog() {
    setImageMeta(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setMessage("");
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function selectFile(file: File | undefined) {
    setMessage("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("请选择 JPEG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > maxSourceSize) {
      setMessage("原图不能超过 8MB。");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const image = new Image();
    image.onload = () => {
      setImageMeta({ url, width: image.naturalWidth, height: image.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.onerror = () => {
      setMessage("图片读取失败，请换一张图片。");
      URL.revokeObjectURL(url);
      objectUrlRef.current = null;
    };
    image.src = url;
  }

  function updateZoom(nextZoom: number) {
    if (!imageMeta) return;
    const normalizedZoom = clamp(nextZoom, 1, 3);
    setZoom(normalizedZoom);
    setOffset((current) => clampOffset(imageMeta, normalizedZoom, current));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageMeta) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!imageMeta || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const nextOffset = {
      x: dragRef.current.offsetX + event.clientX - dragRef.current.startX,
      y: dragRef.current.offsetY + event.clientY - dragRef.current.startY
    };
    setOffset(clampOffset(imageMeta, zoom, nextOffset));
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function buildBlob() {
    if (!imageMeta || !imageRef.current) throw new Error("请先选择图片。");
    const image = imageRef.current;
    const baseScale = Math.max(previewSize / imageMeta.width, previewSize / imageMeta.height);
    const scale = baseScale * zoom;
    const renderedWidth = imageMeta.width * scale;
    const renderedHeight = imageMeta.height * scale;
    const drawX = (previewSize - renderedWidth) / 2 + offset.x;
    const drawY = (previewSize - renderedHeight) / 2 + offset.y;
    const sourceX = (0 - drawX) / scale;
    const sourceY = (0 - drawY) / scale;
    const sourceSize = previewSize / scale;

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片压缩。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputSize, outputSize);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("图片压缩失败。"));
          else resolve(blob);
        },
        "image/webp",
        0.82
      );
    });
  }

  async function uploadAvatar() {
    setMessage("");
    setIsUploading(true);
    try {
      const blob = await buildBlob();
      const formData = new FormData();
      formData.set("entity_type", entityType);
      formData.set("entity_id", entityId);
      formData.set("file", new File([blob], "avatar.webp", { type: "image/webp" }));

      const response = await fetch("/api/uploads/avatar", {
        method: "POST",
        body: formData
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "头像上传失败。");
      }

      setAvatarUrl(result.avatarUrl);
      resetDialog();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "头像上传失败。");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-wire bg-field text-board",
            size === "sm" && "h-12 w-12 text-lg",
            size === "md" && "h-16 w-16 text-xl",
            size === "lg" && "h-20 w-20 text-2xl"
          )}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-black">{avatarInitial(fallback)}</span>
          )}
        </div>
        <div className="grid gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {label}
          </Button>
          <div className="text-xs font-semibold text-muted">512x512 WebP</div>
        </div>
      </div>
      {message && !imageMeta ? <p className="text-xs font-semibold text-accent">{message}</p> : null}

      {imageMeta ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-3 sm:place-items-center">
          <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">裁剪头像</h3>
                <p className="mt-1 text-sm text-muted">拖动图片调整位置，缩放后确认上传。</p>
              </div>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-lg border border-wire transition-colors duration-75 active:bg-field"
                onClick={resetDialog}
                aria-label="关闭"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4 grid justify-center">
              <div
                className="relative h-72 w-72 touch-none select-none overflow-hidden rounded-lg border border-wire bg-field"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
              >
                <img
                  ref={imageRef}
                  src={imageMeta.url}
                  alt=""
                  className="absolute max-w-none"
                  draggable={false}
                  style={imageStyle}
                />
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/50" />
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center gap-2">
                <Minus className="h-4 w-4 text-muted" aria-hidden />
                <input
                  className="w-full accent-board"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => updateZoom(Number(event.target.value))}
                />
                <Plus className="h-4 w-4 text-muted" aria-hidden />
              </div>
              {message ? <p className="text-sm font-semibold text-accent">{message}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  重新选择
                </Button>
                <Button type="button" onClick={uploadAvatar} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      上传中
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" aria-hidden />
                      确认上传
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

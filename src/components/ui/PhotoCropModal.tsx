import { useRef, useEffect, useState, useCallback } from "react";

interface PhotoCropModalProps {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 420;
const CIRCLE_RADIUS = 190;

export default function PhotoCropModal({ file, onConfirm, onCancel }: PhotoCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Active pointers for drag + pinch
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Scale so the image fills the circle on load
      const fill = Math.max(
        (CIRCLE_RADIUS * 2) / image.naturalWidth,
        (CIRCLE_RADIUS * 2) / image.naturalHeight
      );
      const s = Math.max(fill, 0.5);
      setScale(s);
      setOffset({
        x: CANVAS_SIZE / 2 - (image.naturalWidth * s) / 2,
        y: CANVAS_SIZE / 2 - (image.naturalHeight * s) / 2,
      });
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw image
    ctx.drawImage(img, offset.x, offset.y, img.naturalWidth * scale, img.naturalHeight * scale);

    // Dark overlay with circular cutout
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [img, offset, scale]);

  // ── Wheel zoom (non-passive so we can preventDefault) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      setScale((prev) => Math.min(10, Math.max(0.15, prev * factor)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // ── Unified pointer events (mouse + touch + stylus) ─────────────────────
  // setPointerCapture routes all events to this element even outside bounds.
  // Two active pointers = pinch zoom; one = drag.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ptrs = activePointers.current;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      e.preventDefault();

      const prev = ptrs.get(e.pointerId)!;
      const cur = { x: e.clientX, y: e.clientY };

      if (ptrs.size === 1) {
        // Single pointer — drag
        setOffset((o) => ({
          x: o.x + cur.x - prev.x,
          y: o.y + cur.y - prev.y,
        }));
      } else if (ptrs.size === 2) {
        // Two pointers — pinch zoom
        const ids = [...ptrs.keys()];
        const other = ptrs.get(ids[0] === e.pointerId ? ids[1] : ids[0])!;
        const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
        const curDist = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (prevDist > 0) {
          const factor = curDist / prevDist;
          setScale((s) => Math.min(10, Math.max(0.15, s * factor)));
        }
      }

      ptrs.set(e.pointerId, cur);
    };

    const onPointerUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  // ── Zoom slider ───────────────────────────────────────────────────────────
  // Zoom toward/away from the circle center
  const zoomTo = useCallback((newScale: number) => {
    setScale((prev) => {
      const factor = newScale / prev;
      const cx = CANVAS_SIZE / 2;
      const cy = CANVAS_SIZE / 2;
      setOffset((o) => ({
        x: cx - (cx - o.x) * factor,
        y: cy - (cy - o.y) * factor,
      }));
      return newScale;
    });
  }, []);

  // ── Crop & confirm ────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = 400;
    out.height = 400;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    // Scale factor: canvas CSS size vs actual size
    const displayRatio = CANVAS_SIZE / 400;

    ctx.beginPath();
    ctx.arc(200, 200, 200, 0, Math.PI * 2);
    ctx.clip();

    // Map from display canvas coords to output canvas coords
    ctx.drawImage(
      img,
      offset.x / displayRatio,
      offset.y / displayRatio,
      (img.naturalWidth * scale) / displayRatio,
      (img.naturalHeight * scale) / displayRatio
    );

    out.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <h3 className="font-black text-gray-900 text-xl">Adjust Photo</h3>
          <p className="text-gray-400 text-sm mt-1">
            Drag to reposition · Scroll or pinch to zoom
          </p>
        </div>

        {/* Canvas */}
        <div className="relative bg-gray-900">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full touch-none select-none cursor-grab active:cursor-grabbing block"
          />
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-sm opacity-60">Loading…</p>
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="px-6 pt-4 pb-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => zoomTo(Math.max(0.15, scale * 0.85))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition-colors"
            >
              −
            </button>
            <input
              type="range"
              min={0.15}
              max={5}
              step={0.01}
              value={scale}
              onChange={(e) => zoomTo(parseFloat(e.target.value))}
              className="flex-1 accent-emerald-600"
            />
            <button
              onClick={() => zoomTo(Math.min(10, scale * 1.15))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition-colors"
            >
              +
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-1">{Math.round(scale * 100)}%</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-5">
          <button
            onClick={handleConfirm}
            disabled={!img}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors disabled:opacity-50 shadow-sm"
          >
            Save Photo
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

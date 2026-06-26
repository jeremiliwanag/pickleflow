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

  // Drag state
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Pinch-to-zoom state
  const lastPinchDist = useRef<number | null>(null);

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

  // ── Mouse drag ────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOffset((prev) => ({
      x: prev.x + e.clientX - lastPos.current.x,
      y: prev.y + e.clientY - lastPos.current.y,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  // ── Touch drag + pinch zoom ───────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      dragging.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging.current) {
      setOffset((prev) => ({
        x: prev.x + e.touches[0].clientX - lastPos.current.x,
        y: prev.y + e.touches[0].clientY - lastPos.current.y,
      }));
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDist.current != null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = dist / lastPinchDist.current;
      setScale((prev) => Math.min(10, Math.max(0.15, prev * factor)));
      lastPinchDist.current = dist;
    }
  };
  const onTouchEnd = () => {
    dragging.current = false;
    lastPinchDist.current = null;
  };

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
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
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

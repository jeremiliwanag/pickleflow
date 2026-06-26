import { useRef, useEffect, useState, useCallback } from "react";

interface PhotoCropModalProps {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 420;
const CIRCLE_RADIUS = 190;
const OUTPUT_SIZE = 400;

function drawCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  x: number,
  y: number,
  s: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw image
  ctx.drawImage(img, x, y, img.naturalWidth * s, img.naturalHeight * s);

  // Dark overlay EVERYWHERE except inside the circle — use even-odd fill rule
  // so the circle path subtracts from the rectangle, revealing the image below
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2, true); // counter-clockwise = hole
  ctx.fill();
  ctx.restore();

  // Dashed circle border
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export default function PhotoCropModal({ file, onConfirm, onCancel }: PhotoCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [sliderScale, setSliderScale] = useState(1);

  // Active pointers for drag + pinch
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    drawCanvas(canvas, img, offsetRef.current.x, offsetRef.current.y, scaleRef.current);
  }, [img]);

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const fill = Math.max(
        (CIRCLE_RADIUS * 2) / image.naturalWidth,
        (CIRCLE_RADIUS * 2) / image.naturalHeight
      );
      const s = Math.max(fill, 0.5);
      scaleRef.current = s;
      offsetRef.current = {
        x: CANVAS_SIZE / 2 - (image.naturalWidth * s) / 2,
        y: CANVAS_SIZE / 2 - (image.naturalHeight * s) / 2,
      };
      setSliderScale(s);
      setImg(image);
    };
    image.onerror = () => setError("Could not load image.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Draw when image loads or repaint is called ────────────────────────────
  useEffect(() => {
    repaint();
  }, [repaint]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.08 : 0.93);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pointer events ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ptrs = activePointers.current;

    const toCanvasDelta = (dx: number, dy: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        dx: dx * (CANVAS_SIZE / rect.width),
        dy: dy * (CANVAS_SIZE / rect.height),
      };
    };

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
      ptrs.set(e.pointerId, cur);

      if (ptrs.size === 1) {
        const { dx, dy } = toCanvasDelta(cur.x - prev.x, cur.y - prev.y);
        offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
        repaint();
      } else if (ptrs.size === 2) {
        const ids = [...ptrs.keys()];
        const other = ptrs.get(ids[0] === e.pointerId ? ids[1] : ids[0])!;
        const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
        const curDist = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (prevDist > 0) zoom(curDist / prevDist);
      }
    };

    const onPointerUp = (e: PointerEvent) => ptrs.delete(e.pointerId);

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
  }, [repaint]);

  // ── Zoom helper ───────────────────────────────────────────────────────────
  const zoom = useCallback((factor: number) => {
    const newScale = Math.min(10, Math.max(0.15, scaleRef.current * factor));
    const f = newScale / scaleRef.current;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    offsetRef.current = {
      x: cx - (cx - offsetRef.current.x) * f,
      y: cy - (cy - offsetRef.current.y) * f,
    };
    scaleRef.current = newScale;
    setSliderScale(newScale);
    repaint();
  }, [repaint]);

  // ── Crop & confirm ────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!img) return;
    setError(null);

    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) { setError("Canvas not available."); return; }

    const ratio = OUTPUT_SIZE / CANVAS_SIZE;
    const { x, y } = offsetRef.current;
    const s = scaleRef.current;

    // Clip to circle then draw image
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x * ratio, y * ratio, img.naturalWidth * s * ratio, img.naturalHeight * s * ratio);

    out.toBlob(
      (blob) => {
        if (blob) {
          onConfirm(blob);
        } else {
          setError("Failed to generate image. Please try again.");
        }
      },
      "image/jpeg",
      0.92
    );
  }, [img, onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        <div className="px-6 pt-6 pb-3">
          <h3 className="font-black text-gray-900 text-xl">Adjust Photo</h3>
          <p className="text-gray-400 text-sm mt-1">Drag to reposition · Scroll or pinch to zoom</p>
        </div>

        <div className="relative bg-gray-900">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full touch-none select-none cursor-grab active:cursor-grabbing block"
          />
          {!img && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-sm opacity-60">Loading…</p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-500 text-xs font-semibold text-center px-6 pt-3">{error}</p>
        )}

        <div className="px-6 pt-4 pb-1">
          <div className="flex items-center gap-3">
            <button onClick={() => zoom(0.85)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg">−</button>
            <input
              type="range" min={0.15} max={5} step={0.01} value={sliderScale}
              onChange={(e) => zoom(parseFloat(e.target.value) / scaleRef.current)}
              className="flex-1 accent-emerald-600"
            />
            <button onClick={() => zoom(1.15)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg">+</button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-1">{Math.round(sliderScale * 100)}%</p>
        </div>

        <div className="flex gap-3 px-6 py-5">
          <button
            onClick={handleConfirm}
            disabled={!img}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors disabled:opacity-50 shadow-sm"
          >
            Save Photo
          </button>
          <button onClick={onCancel} className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

import { useRef, useEffect, useState, useCallback } from "react";

interface PhotoCropModalProps {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 420;   // internal canvas pixels
const CIRCLE_RADIUS = 190; // px inside the 420×420 internal space
const OUTPUT_SIZE = 400;   // final output image size

export default function PhotoCropModal({ file, onConfirm, onCancel }: PhotoCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  // offset and scale are always in INTERNAL canvas pixel units
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);

  // For re-drawing when state changes
  const [, forceRedraw] = useState(0);
  const redraw = useCallback(() => forceRedraw((n) => n + 1), []);

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Scale so image fills the circle on first load
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

    const { x, y } = offsetRef.current;
    const s = scaleRef.current;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, x, y, img.naturalWidth * s, img.naturalHeight * s);

    // Dark overlay with circle cutout
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
  }, [img, , forceRedraw]); // eslint-disable-line

  // Re-draw whenever counter bumps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = offsetRef.current;
    const s = scaleRef.current;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, x, y, img.naturalWidth * s, img.naturalHeight * s);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      const newScale = Math.min(10, Math.max(0.15, scaleRef.current * factor));
      // Zoom toward circle center
      const cx = CANVAS_SIZE / 2;
      const cy = CANVAS_SIZE / 2;
      const f = newScale / scaleRef.current;
      offsetRef.current = {
        x: cx - (cx - offsetRef.current.x) * f,
        y: cy - (cy - offsetRef.current.y) * f,
      };
      scaleRef.current = newScale;
      redraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [redraw]);

  // ── Pointer events (mouse + touch unified) ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Track active pointers by id
    const ptrs = new Map<number, { x: number; y: number }>();

    // Convert CSS pixel delta → canvas internal pixel delta
    const toCanvasDelta = (dx: number, dy: number) => {
      const rect = canvas.getBoundingClientRect();
      const rx = CANVAS_SIZE / rect.width;
      const ry = CANVAS_SIZE / rect.height;
      return { dx: dx * rx, dy: dy * ry };
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
        // Drag — convert CSS px delta to canvas px delta
        const { dx, dy } = toCanvasDelta(cur.x - prev.x, cur.y - prev.y);
        offsetRef.current = {
          x: offsetRef.current.x + dx,
          y: offsetRef.current.y + dy,
        };
        redraw();
      } else if (ptrs.size === 2) {
        // Pinch zoom
        const ids = [...ptrs.keys()];
        const other = ptrs.get(ids[0] === e.pointerId ? ids[1] : ids[0])!;
        const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
        const curDist = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (prevDist > 0) {
          const factor = curDist / prevDist;
          const newScale = Math.min(10, Math.max(0.15, scaleRef.current * factor));
          const cx = CANVAS_SIZE / 2;
          const cy = CANVAS_SIZE / 2;
          const f = newScale / scaleRef.current;
          offsetRef.current = {
            x: cx - (cx - offsetRef.current.x) * f,
            y: cy - (cy - offsetRef.current.y) * f,
          };
          scaleRef.current = newScale;
          redraw();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); };

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
  }, [redraw]);

  // ── Zoom slider ───────────────────────────────────────────────────────────
  const [sliderScale, setSliderScale] = useState(1);

  useEffect(() => {
    if (img) setSliderScale(scaleRef.current);
  }, [img]);

  const zoomTo = useCallback((newScale: number) => {
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const f = newScale / scaleRef.current;
    offsetRef.current = {
      x: cx - (cx - offsetRef.current.x) * f,
      y: cy - (cy - offsetRef.current.y) * f,
    };
    scaleRef.current = newScale;
    setSliderScale(newScale);
    redraw();
  }, [redraw]);

  // ── Crop & confirm ────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!img) return;

    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    // Map from CANVAS_SIZE space → OUTPUT_SIZE space
    const ratio = OUTPUT_SIZE / CANVAS_SIZE;
    const { x, y } = offsetRef.current;
    const s = scaleRef.current;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      x * ratio,
      y * ratio,
      img.naturalWidth * s * ratio,
      img.naturalHeight * s * ratio
    );

    out.toBlob(
      (blob) => {
        if (blob) {
          onConfirm(blob);
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
          <p className="text-gray-400 text-sm mt-1">
            Drag to reposition · Scroll or pinch to zoom
          </p>
        </div>

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

        <div className="px-6 pt-4 pb-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => zoomTo(Math.max(0.15, sliderScale * 0.85))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition-colors"
            >
              −
            </button>
            <input
              type="range"
              min={0.15}
              max={5}
              step={0.01}
              value={sliderScale}
              onChange={(e) => zoomTo(parseFloat(e.target.value))}
              className="flex-1 accent-emerald-600"
            />
            <button
              onClick={() => zoomTo(Math.min(10, sliderScale * 1.15))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition-colors"
            >
              +
            </button>
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

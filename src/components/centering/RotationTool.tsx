import { useState, useRef, useEffect, useCallback } from "react";
import { rotateImageOnCanvas } from "@/lib/centering/imageUtils";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

interface RotationToolProps {
  imageDataUrl: string;
  suggestedAngle: number;
  onApply: (rotatedDataUrl: string, angleDeg: number) => void;
  onCancel: () => void;
}

const GRID_COLS = 12;
const GRID_ROWS = 8;

export default function RotationTool({ imageDataUrl, suggestedAngle, onApply, onCancel }: RotationToolProps) {
  const [angle, setAngle]     = useState(suggestedAngle !== 0 ? -suggestedAngle : 0);
  const [zoomPct, setZoomPct] = useState(100); // display only
  const [imgLoaded, setImgLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // All "hot" view state lives in refs so pan/zoom updates never trigger React renders
  const angleRef = useRef(angle);
  const zoomRef  = useRef(1);
  const panXRef  = useRef(0);
  const panYRef  = useRef(0);
  useEffect(() => { angleRef.current = angle; }, [angle]);

  const isDragging  = useRef(false);
  const lastPos     = useRef({ x: 0, y: 0 });
  const rafRef      = useRef<number | null>(null);

  // ── Image load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // ── Container size ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Draw (reads from refs — never stale during rapid interaction) ─────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || size.w === 0) return;
    const ctx = canvas.getContext("2d")!;
    const { w: cw, h: ch } = size;
    const z  = zoomRef.current;
    const px = panXRef.current;
    const py = panYRef.current;
    const a  = angleRef.current;

    ctx.clearRect(0, 0, cw, ch);

    // Checkerboard background — matches the centering canvas, always light
    const cs = 16;
    for (let y = 0; y < ch; y += cs) {
      for (let x = 0; x < cw; x += cs) {
        ctx.fillStyle = ((x / cs + y / cs) % 2 === 0) ? "#F0FAF4" : "#E5F5EC";
        ctx.fillRect(x, y, cs, cs);
      }
    }

    // Image — rotated, panned, zoomed
    ctx.save();
    ctx.translate(cw / 2 + px, ch / 2 + py);
    ctx.scale(z, z);
    ctx.rotate((a * Math.PI) / 180);
    const imgAspect = img.width / img.height;
    const fitW = cw * 0.85;
    const fitH = ch * 0.85;
    let dw: number, dh: number;
    if (fitW / imgAspect <= fitH) { dw = fitW;  dh = fitW / imgAspect; }
    else                          { dh = fitH;  dw = fitH * imgAspect; }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    // Grid — always at fixed screen coords (not affected by image pan/zoom)
    const stroke  = Math.max(0.15, 0.8 / z);
    const colW    = cw / GRID_COLS;
    const rowH    = ch / GRID_ROWS;
    const midCol  = GRID_COLS / 2;
    const midRow  = GRID_ROWS / 2;
    const dimLine    = "rgba(255,255,255,0.72)";
    const brightLine = "rgba(255,255,255,1)";

    // Difference makes white strokes invert the pixels underneath them, keeping
    // the temporary grid visible on both light and dark artwork. Limit the
    // compositing mode to the grid and restore it before the next frame.
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    for (let i = 1; i < GRID_COLS; i++) {
      const isMid = i === midCol;
      ctx.strokeStyle = isMid ? brightLine : dimLine;
      ctx.lineWidth   = isMid ? stroke * 2  : stroke;
      ctx.beginPath(); ctx.moveTo(i * colW, 0); ctx.lineTo(i * colW, ch); ctx.stroke();
    }
    for (let j = 1; j < GRID_ROWS; j++) {
      const isMid = j === midRow;
      ctx.strokeStyle = isMid ? brightLine : dimLine;
      ctx.lineWidth   = isMid ? stroke * 2  : stroke;
      ctx.beginPath(); ctx.moveTo(0, j * rowH); ctx.lineTo(cw, j * rowH); ctx.stroke();
    }
    ctx.restore();
  }, [size]);

  // ── Schedule draw via rAF — coalesces rapid calls into one frame ──────────
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Trigger draw when size, angle (slider), or img load changes
  useEffect(() => { scheduleDraw(); }, [scheduleDraw, angle, imgLoaded]);

  // ── Scroll to zoom ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomRef.current = Math.max(0.5, Math.min(10, zoomRef.current * factor));
      setZoomPct(Math.round(zoomRef.current * 100));
      scheduleDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [size.w, scheduleDraw]);

  // ── Pinch + touch pan ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    let lastDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        isDragging.current = true;
        lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDragging.current = false;
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastDist = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging.current) {
        panXRef.current += e.touches[0].clientX - lastPos.current.x;
        panYRef.current += e.touches[0].clientY - lastPos.current.y;
        lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        scheduleDraw();
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastDist > 0) {
          zoomRef.current = Math.max(0.5, Math.min(10, zoomRef.current * (dist / lastDist)));
          setZoomPct(Math.round(zoomRef.current * 100));
        }
        lastDist = dist;
        scheduleDraw();
      }
    };
    const onTouchEnd = () => { isDragging.current = false; lastDist = 0; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  }, [size.w, scheduleDraw]);

  // ── Mouse pan (no React state — writes to refs and calls rAF directly) ────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    panXRef.current += e.clientX - lastPos.current.x;
    panYRef.current += e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    scheduleDraw();
  };
  const onMouseUp = () => { isDragging.current = false; };

  // ── Angle controls ────────────────────────────────────────────────────────
  const handleAngleChange = (v: number) => setAngle(v);
  const bump = (delta: number) => setAngle(a => Math.round((a + delta) * 10) / 10);

  const handleZoomBtn = (factor: number) => {
    zoomRef.current = Math.max(0.5, Math.min(10, zoomRef.current * factor));
    setZoomPct(Math.round(zoomRef.current * 100));
    scheduleDraw();
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img) return;
    const appliedAngle = angleRef.current;
    const c = rotateImageOnCanvas(img, appliedAngle);
    onApply(c.toDataURL("image/png"), appliedAngle);
  };

  return (
    <div className="flex flex-col gap-3 w-full h-full">
      <p className="text-sm text-[#6B7280] flex-shrink-0">
        Rotate the card until its edges align with the grid.
        <span className="text-xs ml-2 text-[#9CA3AF]">Scroll to zoom · Drag to pan</span>
      </p>

      {suggestedAngle !== 0 && (
        <p className="text-xs text-amber-400 bg-amber-400/10 rounded px-3 py-2 flex-shrink-0">
          Detected rotation: ~{(-suggestedAngle).toFixed(1)}° — pre-filled as correction.
        </p>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 rounded-xl overflow-hidden border border-[#C8DDD0]">
        {size.w > 0 && (
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            style={{ display: "block", width: size.w, height: size.h, cursor: isDragging.current ? "grabbing" : "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => bump(-0.1)} className="p-2 bg-[#E5F5EC] hover:bg-[#D4E5DC] rounded text-[#374151]">
            <RotateCcw className="w-4 h-4" />
          </button>
          <input
            type="range" min="-45" max="45" step="0.1" value={angle}
            onChange={(e) => handleAngleChange(parseFloat(e.target.value))}
            className="flex-1 accent-[#4DB371]"
          />
          <button onClick={() => bump(0.1)} className="p-2 bg-[#E5F5EC] hover:bg-[#D4E5DC] rounded text-[#374151]">
            <RotateCw className="w-4 h-4" />
          </button>
          <span className="text-sm font-mono text-[#4DB371] w-16 text-right">{angle.toFixed(1)}°</span>
        </div>

        <div className="flex gap-1.5 items-center flex-wrap">
          {[-90, -45, -15, 0, 15, 45, 90].map((a) => (
            <button
              key={a}
              onClick={() => handleAngleChange(a)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                Math.abs(angle - a) < 0.05 ? "bg-[#4DB371] text-white" : "bg-[#E5F5EC] hover:bg-[#D4E5DC] text-[#374151]"
              }`}
            >
              {a}°
            </button>
          ))}
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => handleZoomBtn(1 / 1.3)} className="p-1.5 bg-[#E5F5EC] hover:bg-[#D4E5DC] rounded text-[#374151]">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-[#4DB371] w-12 text-center">{zoomPct}%</span>
            <button onClick={() => handleZoomBtn(1.3)} className="p-1.5 bg-[#E5F5EC] hover:bg-[#D4E5DC] rounded text-[#374151]">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleApply} className="px-4 py-2 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded text-sm font-medium transition-colors">
            Apply Rotation
          </button>
          <button onClick={onCancel} className="px-4 py-2 bg-[#E5F5EC] hover:bg-[#D4E5DC] text-[#374151] rounded text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

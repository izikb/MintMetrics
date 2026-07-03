import { useRef, useEffect, useCallback, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

interface CropRect { x: number; y: number; w: number; h: number; }
type DragMode = "move" | "nw" | "ne" | "sw" | "se" | "pan" | null;

const CORNER = 12;

interface CropToolProps {
  imageDataUrl: string;
  onCrop: (cropped: string) => void;
  onCancel: () => void;
  displayWidth?: number;
  displayHeight?: number;
}

export default function CropTool({ imageDataUrl, onCrop, onCancel }: CropToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);

  const [size, setSize]         = useState({ w: 0, h: 0 });
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const cropRef = useRef<CropRect>(cropRect);
  useEffect(() => { cropRef.current = cropRect; }, [cropRect]);

  const [zoomPct, setZoomPct] = useState(100);
  const [cursor, setCursor]   = useState("crosshair");

  // All view state in refs for zero-overhead draws during mouse move
  const zoomRef  = useRef(1);
  const panXRef  = useRef(0);
  const panYRef  = useRef(0);

  const dragging   = useRef<DragMode>(null);
  const startRef   = useRef<{ x: number; y: number; rect: CropRect }>({ x: 0, y: 0, rect: cropRect });
  const lastPos    = useRef({ x: 0, y: 0 });
  const rafRef     = useRef<number | null>(null);

  // ── Container size ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Image load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // ── Default crop rect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const pad = Math.round(Math.min(size.w, size.h) * 0.05);
    setCropRect({ x: pad, y: pad, w: size.w - pad * 2, h: size.h - pad * 2 });
  }, [size.w, size.h]);

  // ── Draw (reads refs — never stale) ───────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || size.w === 0) return;
    const ctx = canvas.getContext("2d")!;
    const { w: cw, h: ch } = size;
    const z  = zoomRef.current;
    const ox = panXRef.current;
    const oy = panYRef.current;
    const r  = cropRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Apply zoom/pan — all drawing below is in "base" coords
    ctx.setTransform(z, 0, 0, z, ox, oy);

    // Letterbox image
    const imgAspect = img.width / img.height;
    const cvAspect  = cw / ch;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (imgAspect > cvAspect) {
      drawW = cw;  drawH = cw / imgAspect; drawX = 0;            drawY = (ch - drawH) / 2;
    } else {
      drawH = ch;  drawW = ch * imgAspect; drawX = (cw - drawW) / 2; drawY = 0;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Dim everything
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, cw, ch);

    // Reveal crop area
    const imgScaleX = img.width  / drawW;
    const imgScaleY = img.height / drawH;
    const srcX = Math.max(0, (r.x - drawX) * imgScaleX);
    const srcY = Math.max(0, (r.y - drawY) * imgScaleY);
    const srcW = r.w * imgScaleX;
    const srcH = r.h * imgScaleY;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, r.x, r.y, r.w, r.h);

    // Crop border
    ctx.strokeStyle = "#4DB371";
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // Rule-of-thirds inside crop
    ctx.strokeStyle = "rgba(77,179,113,0.3)";
    ctx.lineWidth = 0.5 / z;
    ctx.setLineDash([3 / z, 3 / z]);
    for (let i = 1; i < 3; i++) {
      const gx = r.x + (r.w * i) / 3;
      const gy = r.y + (r.h * i) / 3;
      ctx.beginPath(); ctx.moveTo(gx, r.y); ctx.lineTo(gx, r.y + r.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r.x, gy); ctx.lineTo(r.x + r.w, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Corner handles
    const cs = CORNER / z;
    ctx.fillStyle = "#4DB371";
    [
      { x: r.x,       y: r.y       },
      { x: r.x + r.w, y: r.y       },
      { x: r.x,       y: r.y + r.h },
      { x: r.x + r.w, y: r.y + r.h },
    ].forEach(({ x, y }) => ctx.fillRect(x - cs / 2, y - cs / 2, cs, cs));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [size]);

  // ── Schedule draw via rAF ─────────────────────────────────────────────────
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw, cropRect]);

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

  // ── Mouse coord → base space ──────────────────────────────────────────────
  const canvasToBase = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (clientX - rect.left) * sx;
    const cy = (clientY - rect.top)  * sy;
    return { x: (cx - panXRef.current) / zoomRef.current, y: (cy - panYRef.current) / zoomRef.current };
  }, []);

  const getMode = useCallback((x: number, y: number): DragMode => {
    const r  = cropRef.current;
    const cs = (CORNER + 4) / zoomRef.current;
    if (Math.abs(x - r.x)       < cs && Math.abs(y - r.y)       < cs) return "nw";
    if (Math.abs(x - (r.x+r.w)) < cs && Math.abs(y - r.y)       < cs) return "ne";
    if (Math.abs(x - r.x)       < cs && Math.abs(y - (r.y+r.h)) < cs) return "sw";
    if (Math.abs(x - (r.x+r.w)) < cs && Math.abs(y - (r.y+r.h)) < cs) return "se";
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)         return "move";
    return "pan";
  }, []);

  const applyDrag = useCallback((x: number, y: number) => {
    const mode = dragging.current;
    if (!mode || mode === "pan") return;
    const dx  = x - startRef.current.x;
    const dy  = y - startRef.current.y;
    const r   = startRef.current.rect;
    const { w: cw, h: ch } = size;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (mode === "move") {
      setCropRect({ x: clamp(r.x + dx, 0, cw - r.w), y: clamp(r.y + dy, 0, ch - r.h), w: r.w, h: r.h });
    } else if (mode === "se") {
      setCropRect({ ...r, w: clamp(r.w + dx, 20, cw - r.x), h: clamp(r.h + dy, 20, ch - r.y) });
    } else if (mode === "nw") {
      const nx = clamp(r.x + dx, 0, r.x + r.w - 20);
      const ny = clamp(r.y + dy, 0, r.y + r.h - 20);
      setCropRect({ x: nx, y: ny, w: r.w - (nx - r.x), h: r.h - (ny - r.y) });
    } else if (mode === "ne") {
      const ny = clamp(r.y + dy, 0, r.y + r.h - 20);
      setCropRect({ x: r.x, y: ny, w: clamp(r.w + dx, 20, cw - r.x), h: r.h - (ny - r.y) });
    } else if (mode === "sw") {
      const nx = clamp(r.x + dx, 0, r.x + r.w - 20);
      setCropRect({ x: nx, y: r.y, w: r.w - (nx - r.x), h: clamp(r.h + dy, 20, ch - r.y) });
    }
  }, [size]);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = canvasToBase(e.clientX, e.clientY);
    const mode = getMode(x, y);
    dragging.current = mode;
    startRef.current = { x, y, rect: { ...cropRef.current } };
    lastPos.current  = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = canvasToBase(e.clientX, e.clientY);
    if (!dragging.current) {
      const m = getMode(x, y);
      if (m === "nw" || m === "se") setCursor("nwse-resize");
      else if (m === "ne" || m === "sw") setCursor("nesw-resize");
      else if (m === "move") setCursor("move");
      else setCursor("grab");
      return;
    }
    if (dragging.current === "pan") {
      // Pan: update refs directly, no React state
      panXRef.current += e.clientX - lastPos.current.x;
      panYRef.current += e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      scheduleDraw();
    } else {
      applyDrag(x, y);
    }
  };
  const onMouseUp = () => { dragging.current = null; };

  // ── Touch support ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    let lastDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const { x, y } = canvasToBase(e.touches[0].clientX, e.touches[0].clientY);
        dragging.current = getMode(x, y);
        startRef.current = { x, y, rect: { ...cropRef.current } };
        lastPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        dragging.current = null;
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastDist = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && dragging.current) {
        if (dragging.current === "pan") {
          panXRef.current += e.touches[0].clientX - lastPos.current.x;
          panYRef.current += e.touches[0].clientY - lastPos.current.y;
          lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          scheduleDraw();
        } else {
          const { x, y } = canvasToBase(e.touches[0].clientX, e.touches[0].clientY);
          applyDrag(x, y);
        }
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
    const onTouchEnd = () => { dragging.current = null; lastDist = 0; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  }, [applyDrag, canvasToBase, getMode, scheduleDraw, size.w]);

  // ── Apply crop ────────────────────────────────────────────────────────────
  const applyCrop = () => {
    const img = imgRef.current;
    const { w: cw, h: ch } = size;
    if (!img || cw === 0) return;
    const imgAspect = img.width / img.height;
    const cvAspect  = cw / ch;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (imgAspect > cvAspect) {
      drawW = cw; drawH = cw / imgAspect; drawX = 0; drawY = (ch - drawH) / 2;
    } else {
      drawH = ch; drawW = ch * imgAspect; drawX = (cw - drawW) / 2; drawY = 0;
    }
    const r = cropRect;
    const imgScaleX = img.width  / drawW;
    const imgScaleY = img.height / drawH;
    const srcX = Math.max(0, (r.x - drawX) * imgScaleX);
    const srcY = Math.max(0, (r.y - drawY) * imgScaleY);
    const srcW = Math.min(img.width  - srcX, r.w * imgScaleX);
    const srcH = Math.min(img.height - srcY, r.h * imgScaleY);
    const out = document.createElement("canvas");
    out.width  = Math.round(srcW);
    out.height = Math.round(srcH);
    out.getContext("2d")!.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    onCrop(out.toDataURL("image/png"));
  };

  const handleZoomBtn = (factor: number) => {
    zoomRef.current = Math.max(0.5, Math.min(10, zoomRef.current * factor));
    setZoomPct(Math.round(zoomRef.current * 100));
    scheduleDraw();
  };

  return (
    <div className="flex flex-col gap-3 w-full h-full">
      <p className="text-sm text-[#6B7280] flex-shrink-0">
        Drag the corners to adjust the crop area, then tap <strong>Apply Crop</strong>.
        <span className="text-xs ml-2 text-[#9CA3AF]">Scroll to zoom · Drag outside crop to pan</span>
      </p>
      <div ref={containerRef} className="flex-1 min-h-0">
        {size.w > 0 && (
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            style={{ display: "block", width: size.w, height: size.h, cursor, borderRadius: 8 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0 items-center">
        <button onClick={applyCrop} className="px-4 py-2 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded text-sm font-medium transition-colors">
          Apply Crop
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-[#E5F5EC] hover:bg-[#D4E5DC] text-[#374151] rounded text-sm transition-colors">
          Cancel
        </button>
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
    </div>
  );
}

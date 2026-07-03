import { useRef, useEffect, useCallback, useState } from "react";
import type { HandlePositions } from "@/lib/centering/analysis";

interface ImageCanvasProps {
  imageDataUrl: string;
  handles: HandlePositions;
  onHandlesChange: (handles: HandlePositions) => void;
  zoom: number;
  panX: number;
  panY: number;
  onViewChange: (zoom: number, panX: number, panY: number) => void;
}

type HandleKey = keyof HandlePositions;
type DragTarget = HandleKey | "pan" | null;

// Hit thresholds (screen px): generous for touch, tight for mouse
const LINE_HIT_MOUSE = 6;
const LINE_HIT_TOUCH = 26;
// Grip tab size for drawing — large enough to be a clear touch target
const GRIP_W = 36;
const GRIP_H = 14;

const EDGE_COLOR = "#1A7A42";
const INNER_COLOR = "#4DB371";
const LINE_OUTLINE = "rgba(0,0,0,0.55)";

const VERT_KEYS: HandleKey[] = ["leftEdge", "leftInner", "rightInner", "rightEdge"];
const HORIZ_KEYS: HandleKey[] = ["topEdge", "topInner", "bottomInner", "bottomEdge"];

function handleColor(key: HandleKey): string {
  return key === "leftEdge" || key === "rightEdge" || key === "topEdge" || key === "bottomEdge"
    ? EDGE_COLOR
    : INNER_COLOR;
}
function handleDash(key: HandleKey): number[] {
  return key === "leftInner" || key === "rightInner" || key === "topInner" || key === "bottomInner"
    ? [6, 4]
    : [];
}

export default function ImageCanvas({
  imageDataUrl,
  handles,
  onHandlesChange,
  zoom,
  panX,
  panY,
  onViewChange,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragging = useRef<DragTarget>(null);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchDist = useRef<number>(0);
  // When a touch lands near-but-not-exactly on a handle, remember the offset
  // so the handle doesn't jump to the finger center — it stays in place.
  const touchOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursor, setCursor] = useState("grab");
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Track container size via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0)
          setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const cw = canvasSize.w;
  const ch = canvasSize.h;

  const getMinZoom = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 0.1;
    return Math.min(cw / img.width, ch / img.height);
  }, [cw, ch]);

  const clampPan = useCallback(
    (z: number, px: number, py: number) => {
      const img = imgRef.current;
      if (!img) return { panX: px, panY: py };
      const iw = img.width * z, ih = img.height * z;
      const cpx = iw >= cw ? Math.min(0, Math.max(cw - iw, px)) : (cw - iw) / 2;
      const cpy = ih >= ch ? Math.min(0, Math.max(ch - ih, py)) : (ch - ih) / 2;
      return { panX: cpx, panY: cpy };
    },
    [cw, ch]
  );

  // Load image — drawRef is populated after draw() is defined below; the
  // ref is used inside onload so we capture it at call-time, not setup-time.
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Immediately redraw with the new image — without this, the canvas can
      // stay stale if zoom/pan props happen to be the same as before.
      requestAnimationFrame(() => drawRef.current?.());
      const fitZ = Math.min(cw / img.width, ch / img.height);
      onViewChange(fitZ, (cw - img.width * fitZ) / 2, (ch - img.height * fitZ) / 2);
    };
    img.src = imageDataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl]);

  // Re-clamp when canvas resizes
  useEffect(() => {
    if (!imgRef.current) return;
    const { panX: cpx, panY: cpy } = clampPan(zoom, panX, panY);
    if (cpx !== panX || cpy !== panY) onViewChange(zoom, cpx, cpy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cw, ch]);

  const toScreen = useCallback(
    (ix: number, iy: number) => ({ sx: ix * zoom + panX, sy: iy * zoom + panY }),
    [zoom, panX, panY]
  );
  const toImage = useCallback(
    (sx: number, sy: number) => ({ ix: (sx - panX) / zoom, iy: (sy - panY) / zoom }),
    [zoom, panX, panY]
  );

  // Hit detection: scan all 8 handle lines, find closest within hitRadius.
  const getHitTarget = useCallback(
    (sx: number, sy: number, hitRadius = LINE_HIT_MOUSE): DragTarget => {
      const img = imgRef.current;
      if (!img) return null;

      const s0 = toScreen(0, 0);
      const s1 = toScreen(img.width, img.height);
      const candidates: { key: HandleKey; dist: number }[] = [];

      // Vertical lines — close in X, within image Y bounds
      for (const key of VERT_KEYS) {
        const lineX = toScreen(handles[key], 0).sx;
        const dx = Math.abs(sx - lineX);
        if (dx <= hitRadius && sy >= s0.sy - hitRadius && sy <= s1.sy + hitRadius) {
          candidates.push({ key, dist: dx });
        }
      }
      // Horizontal lines — close in Y, within image X bounds
      for (const key of HORIZ_KEYS) {
        const lineY = toScreen(0, handles[key]).sy;
        const dy = Math.abs(sy - lineY);
        if (dy <= hitRadius && sx >= s0.sx - hitRadius && sx <= s1.sx + hitRadius) {
          candidates.push({ key, dist: dy });
        }
      }

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0].key;
    },
    [handles, toScreen]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, cw, ch);

    // Checkerboard bg
    const cs = 16;
    for (let y = 0; y < ch; y += cs) {
      for (let x = 0; x < cw; x += cs) {
        ctx.fillStyle = ((x / cs + y / cs) % 2 === 0) ? "#F0FAF4" : "#E5F5EC";
        ctx.fillRect(x, y, cs, cs);
      }
    }

    // Image — disable smoothing only when zoomed in past native res (pixel-accurate editing)
    // Keep high-quality downscaling when zoomed out so the image looks normal
    ctx.save();
    ctx.imageSmoothingEnabled = zoom <= 1.5;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    const imgW = img.width, imgH = img.height;
    const s0 = toScreen(0, 0);
    const s1 = toScreen(imgW, imgH);

    const clampX = (x: number) => Math.max(0, Math.min(cw, x));
    const clampY = (y: number) => Math.max(0, Math.min(ch, y));

    const lineTop = clampY(s0.sy);
    const lineBot = clampY(s1.sy);
    const lineLeft = clampX(s0.sx);
    const lineRight = clampX(s1.sx);

    const drawLine = (x1: number, y1: number, x2: number, y2: number, key: HandleKey) => {
      const dash = handleDash(key);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = LINE_OUTLINE;
      ctx.lineWidth = 3;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.strokeStyle = handleColor(key);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    // Draw a grip tab on the line — at the visible midpoint of the line on canvas
    const drawGrip = (key: HandleKey, isVert: boolean) => {
      const color = handleColor(key);
      const s = isVert
        ? toScreen(handles[key], 0)
        : toScreen(0, handles[key]);
      const lx = s.sx;
      const ly = s.sy;
      const MARGIN = GRIP_H + 4;

      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;

      if (isVert) {
        // Grip tab centered on the visible canvas midpoint of this vertical line
        const gripY = Math.max(MARGIN, Math.min(ch - MARGIN, (lineTop + lineBot) / 2));
        ctx.beginPath();
        ctx.roundRect(lx - GRIP_W / 2, gripY - GRIP_H / 2, GRIP_W, GRIP_H, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        const gripX = Math.max(MARGIN, Math.min(cw - MARGIN, (lineLeft + lineRight) / 2));
        ctx.beginPath();
        ctx.roundRect(gripX - GRIP_H / 2, ly - GRIP_W / 2, GRIP_H, GRIP_W, 3);
        ctx.fill();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    // Draw all 8 handle lines + grips
    for (const key of VERT_KEYS) {
      const lx = toScreen(handles[key], 0).sx;
      drawLine(lx, lineTop, lx, lineBot, key);
      drawGrip(key, true);
    }
    for (const key of HORIZ_KEYS) {
      const ly = toScreen(0, handles[key]).sy;
      drawLine(lineLeft, ly, lineRight, ly, key);
      drawGrip(key, false);
    }

    // ─── Legend ──────────────────────────────────────────────────────────────
    {
      ctx.setLineDash([]);
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const legPad = 8;
      const legItemGap = 16;
      const lineLen = 18;
      const lineTextGap = 6;

      const item1Label = "Card edge";
      const item2Label = "Inner border";
      const item1TextW = ctx.measureText(item1Label).width;
      const item2TextW = ctx.measureText(item2Label).width;
      const item1W = lineLen + lineTextGap + item1TextW;
      const item2W = lineLen + lineTextGap + item2TextW;
      const totalW = legPad + item1W + legItemGap + item2W + legPad;
      const legH = 22;
      const legX = 6;
      const legY = ch - 6 - legH;

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.roundRect(legX, legY, totalW, legH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const midY = legY + legH / 2;
      let cx = legX + legPad;

      const drawLegItem = (x: number, color: string, dash: number[], label: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x + lineLen, midY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#374151";
        ctx.fillText(label, x + lineLen + lineTextGap, midY);
      };
      drawLegItem(cx, EDGE_COLOR, [], item1Label);
      cx += item1W + legItemGap;
      drawLegItem(cx, INNER_COLOR, [5, 3], item2Label);
      ctx.textBaseline = "alphabetic";
    }

    // ─── Zoom badge ──────────────────────────────────────────────────────────
    const badge = `${(zoom * 100).toFixed(0)}%`;
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    const bw = ctx.measureText(badge).width + 12;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(cw - bw - 4, ch - 22, bw, 18);
    ctx.fillStyle = "#6B7280";
    ctx.fillText(badge, cw - 6, ch - 8);
  }, [handles, zoom, panX, panY, cw, ch, toScreen]);

  // Keep drawRef pointing at the latest draw so the async image-load callback
  // can always trigger a fresh redraw (must come after draw is declared above).
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      dragging.current = getHitTarget(sx, sy) ?? "pan";
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    },
    [getHitTarget]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

      if (!dragging.current) {
        const t = getHitTarget(sx, sy);
        if (!t) { setCursor("grab"); return; }
        if (VERT_KEYS.includes(t as HandleKey)) setCursor("ew-resize");
        else setCursor("ns-resize");
        return;
      }

      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      const img = imgRef.current;
      if (!img) return;

      if (dragging.current === "pan") {
        const { panX: cpx, panY: cpy } = clampPan(zoom, panX + dx, panY + dy);
        onViewChange(zoom, cpx, cpy);
      } else {
        const { ix, iy } = toImage(sx, sy);
        const h = { ...handles };
        const key = dragging.current as HandleKey;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        const W = img.width, H = img.height;

        if (key === "leftEdge")    h.leftEdge    = clamp(ix, 0,                h.leftInner - 2);
        else if (key === "leftInner")  h.leftInner  = clamp(ix, h.leftEdge + 2,  h.rightInner - 2);
        else if (key === "rightInner") h.rightInner = clamp(ix, h.leftInner + 2, h.rightEdge - 2);
        else if (key === "rightEdge")  h.rightEdge  = clamp(ix, h.rightInner + 2, W);
        else if (key === "topEdge")    h.topEdge    = clamp(iy, 0,               h.topInner - 2);
        else if (key === "topInner")   h.topInner   = clamp(iy, h.topEdge + 2,   h.bottomInner - 2);
        else if (key === "bottomInner")h.bottomInner= clamp(iy, h.topInner + 2,  h.bottomEdge - 2);
        else if (key === "bottomEdge") h.bottomEdge = clamp(iy, h.bottomInner + 2, H);

        onHandlesChange(h);
      }
    },
    [dragging, getHitTarget, handles, onHandlesChange, panX, panY, zoom, clampPan, toImage, onViewChange]
  );

  const onMouseUp = useCallback(() => { dragging.current = null; setCursor("grab"); }, []);

  // ─── Touch events ──────────────────────────────────────────────────────────
  // applyMove: useOffset=true subtracts the stored touchOffset so the handle
  // doesn't jump to the exact finger center (important on mobile).
  const applyMove = useCallback(
    (clientX: number, clientY: number, useOffset = false) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const rawSx = clientX - rect.left;
      const rawSy = clientY - rect.top;
      const dx = clientX - lastPos.current.x;
      const dy = clientY - lastPos.current.y;
      lastPos.current = { x: clientX, y: clientY };
      const img = imgRef.current;
      if (!img || !dragging.current) return;

      if (dragging.current === "pan") {
        const { panX: cpx, panY: cpy } = clampPan(zoom, panX + dx, panY + dy);
        onViewChange(zoom, cpx, cpy);
      } else {
        // Apply offset so the handle stays where the finger first touched it
        const sx = useOffset ? rawSx - touchOffset.current.x : rawSx;
        const sy = useOffset ? rawSy - touchOffset.current.y : rawSy;
        const { ix, iy } = toImage(sx, sy);
        const h = { ...handles };
        const key = dragging.current as HandleKey;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        const W = img.width, H = img.height;
        if (key === "leftEdge")         h.leftEdge     = clamp(ix, 0,                h.leftInner - 2);
        else if (key === "leftInner")   h.leftInner    = clamp(ix, h.leftEdge + 2,   h.rightInner - 2);
        else if (key === "rightInner")  h.rightInner   = clamp(ix, h.leftInner + 2,  h.rightEdge - 2);
        else if (key === "rightEdge")   h.rightEdge    = clamp(ix, h.rightInner + 2, W);
        else if (key === "topEdge")     h.topEdge      = clamp(iy, 0,                h.topInner - 2);
        else if (key === "topInner")    h.topInner     = clamp(iy, h.topEdge + 2,    h.bottomInner - 2);
        else if (key === "bottomInner") h.bottomInner  = clamp(iy, h.topInner + 2,   h.bottomEdge - 2);
        else if (key === "bottomEdge")  h.bottomEdge   = clamp(iy, h.bottomInner + 2, H);
        onHandlesChange(h);
      }
    },
    [clampPan, handles, onHandlesChange, onViewChange, panX, panY, toImage, zoom]
  );

  // Native touch handlers bound with passive:false so preventDefault works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
        // Use a large hit radius for touch — fingers are wide
        const hitKey = getHitTarget(sx, sy, LINE_HIT_TOUCH);
        dragging.current = hitKey ?? "pan";
        lastPos.current = { x: t.clientX, y: t.clientY };

        // Compute how far the finger landed from the exact handle line.
        // We'll subtract this throughout the drag so the handle doesn't jump.
        if (hitKey && hitKey !== "pan") {
          const isVert = VERT_KEYS.includes(hitKey as HandleKey);
          const handleScreenPos = isVert
            ? (panX + (handles[hitKey as HandleKey] ?? 0) * zoom)
            : (panY + (handles[hitKey as HandleKey] ?? 0) * zoom);
          touchOffset.current = {
            x: isVert  ? sx - handleScreenPos : 0,
            y: !isVert ? sy - handleScreenPos : 0,
          };
        } else {
          touchOffset.current = { x: 0, y: 0 };
        }
      } else if (e.touches.length === 2) {
        dragging.current = null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDist.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && dragging.current) {
        applyMove(e.touches[0].clientX, e.touches[0].clientY, true);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const factor = dist / (pinchDist.current || dist);
        pinchDist.current = dist;

        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = canvas.getBoundingClientRect();
        const cx = mx - rect.left, cy = my - rect.top;

        const minZ = getMinZoom();
        const newZoom = Math.max(minZ, Math.min(40, zoom * factor));
        const rawPX = cx - (cx - panX) * (newZoom / zoom);
        const rawPY = cy - (cy - panY) * (newZoom / zoom);
        const { panX: cpx, panY: cpy } = clampPan(newZoom, rawPX, rawPY);
        onViewChange(newZoom, cpx, cpy);
      }
    };

    const handleTouchEnd = () => { dragging.current = null; };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [applyMove, clampPan, getHitTarget, getMinZoom, onViewChange, panX, panY, zoom]);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const minZ = getMinZoom();
      const newZoom = Math.max(minZ, Math.min(40, zoom * factor));
      const rawPX = mx - (mx - panX) * (newZoom / zoom);
      const rawPY = my - (my - panY) * (newZoom / zoom);
      const { panX: cpx, panY: cpy } = clampPan(newZoom, rawPX, rawPY);
      onViewChange(newZoom, cpx, cpy);
    },
    [zoom, panX, panY, getMinZoom, clampPan, onViewChange]
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        width={cw}
        height={ch}
        style={{ cursor, display: "block", position: "absolute", inset: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />
    </div>
  );
}

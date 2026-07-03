import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, ZoomIn, ZoomOut, Crop, RotateCw, Download,
  X, ImageIcon, Crosshair, BarChart2, Trash2,
  Loader2, HelpCircle, Home, Sun, Moon, AlertTriangle,
} from "lucide-react";
import ImageCanvas from "@/components/centering/ImageCanvas";
import CropTool from "@/components/centering/CropTool";
import RotationTool from "@/components/centering/RotationTool";
import CenteringResults from "@/components/centering/CenteringResults";
import {
  calculateCentering,
  analyzeRotation,
  exportResultImage,
  defaultHandles,
  type HandlePositions,
  type CenteringResult,
  type RotationAnalysis,
} from "@/lib/centering/analysis";
import { useCardHistory, type SavedSession } from "@/lib/centering/useCardHistory";


type Side = "front" | "back";
type Tool = "none" | "crop" | "rotation";
type MobileTab = "upload" | "measure" | "results";

interface CardState {
  imageDataUrl: string | null;
  handles: HandlePositions;
  result: CenteringResult | null;
  rotationAnalysis: RotationAnalysis | null;
  zoom: number;
  panX: number;
  panY: number;
  imgWidth: number;
  imgHeight: number;
}

function makeDefault(): CardState {
  const h = defaultHandles(100, 100);
  return {
    imageDataUrl: null,
    handles: h,
    result: null,
    rotationAnalysis: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    imgWidth: 100,
    imgHeight: 100,
  };
}

export default function CardCenteringApp() {
  const [activeSide, setActiveSide] = useState<Side>("front");
  const [tool, setTool] = useState<Tool>("none");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("upload");

  const [front, setFront] = useState<CardState>(makeDefault());
  const [back, setBack] = useState<CardState>(makeDefault());
  const [helpOpen, setHelpOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("mm-dark") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("mm-dark", darkMode ? "1" : "0"); } catch {}
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Apply on mount too (for persisted preference)
  useEffect(() => {
    if (localStorage.getItem("mm-dark") === "1") {
      document.documentElement.classList.add("dark");
    }
  }, []);
  const frontHasImage = useRef(false);
  const backHasImage = useRef(false);
  frontHasImage.current = !!front.imageDataUrl;
  backHasImage.current = !!back.imageDataUrl;

  const current = activeSide === "front" ? front : back;
  const setCurrent = activeSide === "front" ? setFront : setBack;


  const { consentAsked, setConsentAsked, cacheEnabled, setCacheEnabled, history, upsertSession, deleteSession, clearHistory } = useCardHistory();
  const sessionIdRef = useRef<string>(crypto.randomUUID());


  // Auto-save whenever results or handles change (debounced 2 s)
  useEffect(() => {
    if (!cacheEnabled) return;
    if (!front.result && !back.result) return;
    const tid = window.setTimeout(() => {
      upsertSession(sessionIdRef.current, front, back);
    }, 2000);
    return () => window.clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front.result, front.handles, front.imageDataUrl, back.result, back.handles, back.imageDataUrl, cacheEnabled]);

  const loadFromHistory = useCallback((session: SavedSession) => {
    const toState = (s: SavedSession["front"]) =>
      s
        ? { imageDataUrl: s.imageDataUrl, handles: s.handles, result: s.result, rotationAnalysis: null, zoom: 1, panX: 0, panY: 0, imgWidth: s.imgWidth, imgHeight: s.imgHeight }
        : makeDefault();
    setFront(toState(session.front));
    setBack(toState(session.back));
    setActiveSide(session.front ? "front" : "back");
    sessionIdRef.current = session.id;
    setMobileTab(session.front?.imageDataUrl || session.back?.imageDataUrl ? "measure" : "upload");
  }, []);

  const loadImage = useCallback(async (file: File, side: Side) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target!.result as string;
      const img = new Image();
      img.onload = async () => {
        const handles = defaultHandles(img.width, img.height);
        const result = calculateCentering(handles);

        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = img.width;
        tmpCanvas.height = img.height;
        const ctx = tmpCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const rotationAnalysis = await analyzeRotation(imageData);

        const state: CardState = {
          imageDataUrl: dataUrl,
          handles,
          result,
          rotationAnalysis,
          zoom: 1,
          panX: 0,
          panY: 0,
          imgWidth: img.width,
          imgHeight: img.height,
        };

        if (side === "front") {
          setFront(state);
          sessionIdRef.current = crypto.randomUUID();
        } else {
          setBack(state);
        }
        setActiveSide(side);
        setTool("none");
        const otherHasImage = side === "front" ? backHasImage.current : frontHasImage.current;
        if (otherHasImage) setMobileTab("measure");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, side: Side) => {
      const file = e.target.files?.[0];
      if (file) loadImage(file, side);
      e.target.value = "";
    },
    [loadImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, side: Side) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) loadImage(file, side);
    },
    [loadImage]
  );

  const clearImage = useCallback((side: Side) => {
    if (side === "front") {
      setFront(makeDefault());
    } else {
      setBack(makeDefault());
    }
    const otherSide: Side = side === "front" ? "back" : "front";
    const otherHas = side === "front" ? backHasImage.current : frontHasImage.current;
    if (otherHas) {
      setActiveSide(otherSide);
    } else {
      setMobileTab("upload");
    }
  }, []);

  const handleHandlesChange = useCallback(
    (handles: HandlePositions) => {
      const result = calculateCentering(handles);
      setCurrent((s) => ({ ...s, handles, result }));
    },
    [setCurrent]
  );

  const handleViewChange = useCallback(
    (zoom: number, panX: number, panY: number) => {
      setCurrent((s) => ({ ...s, zoom, panX, panY }));
    },
    [setCurrent]
  );

  const handleZoom = (factor: number) => {
    setCurrent((s) => {
      const newZoom = Math.max(0.05, Math.min(40, s.zoom * factor));
      return { ...s, zoom: newZoom };
    });
  };

  const handleCropApply = (croppedDataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const handles = defaultHandles(img.width, img.height);
      const result = calculateCentering(handles);
      setCurrent((s) => ({
        ...s,
        imageDataUrl: croppedDataUrl,
        handles,
        result,
        zoom: 1,
        panX: 0,
        panY: 0,
        imgWidth: img.width,
        imgHeight: img.height,
      }));
      setTool("none");
    };
    img.src = croppedDataUrl;
  };

  const handleRotationApply = async (rotatedDataUrl: string) => {
    const img = new Image();
    img.onload = async () => {
      const handles = defaultHandles(img.width, img.height);
      const result = calculateCentering(handles);

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = img.width;
      tmpCanvas.height = img.height;
      const ctx = tmpCanvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const rotationAnalysis = await analyzeRotation(imageData);

      setCurrent((s) => ({
        ...s,
        imageDataUrl: rotatedDataUrl,
        handles,
        result,
        rotationAnalysis,
        zoom: 1,
        panX: 0,
        panY: 0,
        imgWidth: img.width,
        imgHeight: img.height,
      }));
      setTool("none");
    };
    img.src = rotatedDataUrl;
  };

  const loadSideCanvas = async (s: CardState): Promise<HTMLCanvasElement> => {
    const img = new Image();
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.src = s.imageDataUrl!;
    });
    const c = document.createElement("canvas");
    c.width = s.imgWidth;
    c.height = s.imgHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return c;
  };

  const stackPanels = async (panels: string[]): Promise<string> => {
    if (panels.length === 1) return panels[0];
    const imgs = await Promise.all(
      panels.map(
        (url) =>
          new Promise<HTMLImageElement>((res) => {
            const i = new Image();
            i.onload = () => res(i);
            i.src = url;
          })
      )
    );
    const gap = 24;
    const totalW = Math.max(...imgs.map((i) => i.width));
    const totalH = imgs.reduce((s, i) => s + i.height, 0) + gap * (imgs.length - 1);
    const combined = document.createElement("canvas");
    combined.width = totalW;
    combined.height = totalH;
    const ctx = combined.getContext("2d")!;
    ctx.fillStyle = "#FAFAFA";
    ctx.fillRect(0, 0, totalW, totalH);
    let y = 0;
    for (const i of imgs) {
      ctx.drawImage(i, Math.round((totalW - i.width) / 2), y);
      y += i.height + gap;
    }
    return combined.toDataURL("image/jpeg", 0.88);
  };

  const addBrandHeader = async (dataUrl: string): Promise<string> => {
    await document.fonts.load("36px 'Oi'");
    const img = await new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = dataUrl;
    });
    const headerH = 60;
    const out = document.createElement("canvas");
    out.width = img.width;
    out.height = img.height + headerH;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#FAFAFA";
    ctx.fillRect(0, 0, out.width, headerH);
    ctx.font = "36px 'Oi', cursive";
    ctx.fillStyle = "#4DB371";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Mint Metrics", out.width / 2, headerH / 2);
    ctx.drawImage(img, 0, headerH);
    return out.toDataURL("image/jpeg", 0.88);
  };

  const handleExport = () => {
    runExport();
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const sides: Side[] = ["front", "back"];

      const panels: string[] = [];
      for (const side of sides) {
        const s = side === "front" ? front : back;
        if (!s.imageDataUrl || !s.result) continue;
        const c = await loadSideCanvas(s);
        panels.push(await exportResultImage(c, s.handles, s.result, side === "front" ? "Front" : "Back"));
      }
      if (panels.length === 0) return;
      setExportUrl(await addBrandHeader(await stackPanels(panels)));
    } finally {
      setExporting(false);
    }
  };

  const warning = current.rotationAnalysis?.warning;
  const hasResult = !!current.result && !!current.imageDataUrl;
  const hasAnyImage = !!(front.imageDataUrl || back.imageDataUrl);

  // ─── History helpers ───────────────────────────────────────────────────────
  const relativeTime = (ts: number) => {
    const d = Date.now() - ts;
    const m = Math.floor(d / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const historyPanel = (compact = false) => {
    if (!cacheEnabled || history.length === 0) return null;
    return (
      <div className={compact ? "space-y-1" : "space-y-2"}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide">Recent Cards</p>
          <button
            onClick={clearHistory}
            className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
          >
            Clear
          </button>
        </div>
        <div className="space-y-1.5">
          {history.map((session) => {
            const thumb = session.front?.imageDataUrl ?? session.back?.imageDataUrl;
            const fr = session.front?.result;
            const br = session.back?.result;
            return (
              <div
                key={session.id}
                className="flex items-center gap-1 bg-[#F0FAF4] rounded-lg overflow-hidden"
              >
                {/* Load button — takes up most of the row */}
                <button
                  onClick={() => loadFromHistory(session)}
                  className="flex-1 flex items-center gap-2.5 p-2 hover:bg-[#E5F5EC] text-left transition-colors min-w-0"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className={`object-cover rounded flex-shrink-0 ${compact ? "w-10 h-14" : "w-12 h-16"}`}
                    />
                  ) : (
                    <div className={`bg-[#E5F5EC] rounded flex-shrink-0 ${compact ? "w-10 h-14" : "w-12 h-16"}`} />
                  )}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs text-[#6B7280]">{relativeTime(session.timestamp)}</p>
                    {fr && (
                      <p className="text-xs font-mono text-[#4DB371] truncate">
                        F {fr.leftPercent.toFixed(1)}/{fr.rightPercent.toFixed(1)}
                        <span className="text-[#9CA3AF] mx-1">·</span>
                        {fr.topPercent.toFixed(1)}/{fr.bottomPercent.toFixed(1)}
                      </p>
                    )}
                    {br && (
                      <p className="text-xs font-mono text-[#4DB371] truncate">
                        B {br.leftPercent.toFixed(1)}/{br.rightPercent.toFixed(1)}
                        <span className="text-[#9CA3AF] mx-1">·</span>
                        {br.topPercent.toFixed(1)}/{br.bottomPercent.toFixed(1)}
                      </p>
                    )}
                    {fr && (
                      <div className="flex gap-1 flex-wrap pt-0.5">
                        {(["psa", "bgs", "cgc"] as const).map((k) => {
                          const g = fr.graderGrades[k];
                          return (
                            <span
                              key={k}
                              className="text-xs font-bold px-1 py-px rounded"
                              style={{ color: g.color, background: g.color + "22" }}
                            >
                              {k.toUpperCase()} {g.numeric}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>

                {/* Delete button */}
                <button
                  onClick={() => deleteSession(session.id)}
                  title="Delete this session"
                  className="flex-shrink-0 p-2 mr-1 text-[#9CA3AF] hover:text-red-500 transition-colors rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Only show the toggle after the user has already responded to the consent banner.
  const cacheToggle = consentAsked ? (
    <p className="text-center">
      <button
        onClick={() => setCacheEnabled(!cacheEnabled)}
        className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors underline underline-offset-2"
      >
        {cacheEnabled ? "Disable card history" : "Enable card history"}
      </button>
    </p>
  ) : null;

  // ─── Shared upload zone (small, for sidebar) ───────────────────────────────
  const uploadZoneSmall = (side: Side) => {
    const s = side === "front" ? front : back;
    return (
      <div key={side}>
        <p className="text-xs text-[#6B7280] mb-1 capitalize font-medium">{side}</p>
        <label
          className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed cursor-pointer text-center transition-colors px-2 py-3 ${
            s.imageDataUrl
              ? "border-[#C8DDD0] bg-[#E5F5EC]/60 hover:border-[#9CA3AF]"
              : "border-[#C8DDD0] bg-[#E5F5EC]/30 hover:border-[#4DB371]"
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, side)}
        >
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => handleFileInput(e, side)}
          />
          {s.imageDataUrl ? (
            <img src={s.imageDataUrl} alt={side} className="w-full h-16 object-contain rounded" />
          ) : (
            <>
              <Upload className="w-5 h-5 text-[#8899AA]" />
              <span className="text-xs text-[#8899AA]">Drop or click</span>
            </>
          )}
        </label>
        {s.imageDataUrl && (
          <button
            onClick={() => clearImage(side)}
            className="mt-1 w-full flex items-center justify-center gap-1 py-1 rounded text-xs text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
    );
  };

  // ─── Large upload zone (for empty center / mobile upload tab) ──────────────
  const uploadZoneLarge = (side: Side, compact = false) => {
    const s = side === "front" ? front : back;
    const isActive = activeSide === side;
    return (
      <label
        key={side}
        onClick={() => setActiveSide(side)}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
          compact ? "p-4 min-h-[160px]" : "flex-1 p-6"
        } ${
          s.imageDataUrl
            ? "border-[#C8DDD0] bg-[#E5F5EC]/40"
            : isActive
            ? "border-[#4DB371] bg-[#68F299]/10 hover:bg-[#68F299]/15"
            : "border-[#C8DDD0] bg-[#F0FAF4]/20 hover:border-[#9CA3AF] hover:bg-[#E5F5EC]/30"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, side)}
      >
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => handleFileInput(e, side)}
        />
        {s.imageDataUrl ? (
          <>
            <img src={s.imageDataUrl} alt={side} className="w-full h-full max-h-48 object-contain rounded-xl" />
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearImage(side); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-[#C8DDD0] flex items-center justify-center text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className={`rounded-2xl flex items-center justify-center ${compact ? "w-14 h-14" : "w-20 h-20"} ${isActive ? "bg-[#68F299]/20" : "bg-[#F0FAF4]"}`}>
              <Upload className={`${compact ? "w-7 h-7" : "w-10 h-10"} ${isActive ? "text-[#4DB371]" : "text-[#8899AA]"}`} />
            </div>
            <div className="text-center">
              <p className={`font-bold capitalize ${compact ? "text-base" : "text-xl"} ${isActive ? "text-[#4DB371]" : "text-[#6B7280]"}`}>
                {side}
              </p>
              <p className={`text-sm mt-0.5 ${isActive ? "text-[#68F299]" : "text-[#9CA3AF]"}`}>
                {compact ? "Tap to upload" : "Drop image here or click to browse"}
              </p>
            </div>
            {!compact && (
              <div className={`px-4 py-2 rounded-full text-sm font-medium border ${isActive ? "border-[#4DB371] text-[#4DB371]" : "border-[#C8DDD0] text-[#8899AA]"}`}>
                Choose file
              </div>
            )}
          </>
        )}
      </label>
    );
  };

  // ─── Canvas section ────────────────────────────────────────────────────────
  const canvasSection = () => (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      <button
        onClick={() => setHelpOpen(true)}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/90 border border-[#C8DDD0] hover:bg-[#E5F5EC] flex items-center justify-center transition-colors shadow-sm"
        title="How to use"
      >
        <HelpCircle className="w-4 h-4 text-[#4DB371]" />
      </button>
      {warning && tool === "none" && (
        <div className="flex items-start gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 flex-1">{warning}</p>
          {current.rotationAnalysis?.isRotated && (
            <button
              onClick={() => setTool("rotation")}
              className="flex-shrink-0 text-xs bg-amber-500 hover:bg-amber-400 text-white font-semibold px-3 py-1 rounded-full transition-colors"
            >
              Fix
            </button>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 p-2 md:p-3">
        {!current.imageDataUrl ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
            <p className="text-[#8899AA] text-sm">No image loaded for {activeSide} side</p>
            <button
              onClick={() => setMobileTab("upload")}
              className="flex items-center gap-2 px-4 py-2 bg-[#4DB371] text-white rounded-lg text-sm font-medium md:hidden"
            >
              <Upload className="w-4 h-4" /> Upload Image
            </button>
          </div>
        ) : tool === "crop" ? (
          <CropTool
            imageDataUrl={current.imageDataUrl}
            onCrop={handleCropApply}
            onCancel={() => setTool("none")}
          />
        ) : tool === "rotation" ? (
          <div className="w-full h-full">
            <RotationTool
              imageDataUrl={current.imageDataUrl}
              suggestedAngle={current.rotationAnalysis?.estimatedAngle ?? 0}
              onApply={handleRotationApply}
              onCancel={() => setTool("none")}
            />
          </div>
        ) : (
          <div className="w-full h-full rounded-xl overflow-hidden border border-[#D4E5DC]">
            <ImageCanvas
              imageDataUrl={current.imageDataUrl}
              handles={current.handles}
              onHandlesChange={handleHandlesChange}
              zoom={current.zoom}
              panX={current.panX}
              panY={current.panY}
              onViewChange={handleViewChange}
            />
          </div>
        )}
      </div>
      {/* Mobile tool strip */}
      {current.imageDataUrl && tool === "none" && (
        <div className="flex md:hidden items-center gap-2 px-3 pb-2 flex-shrink-0 border-t border-[#D4E5DC] pt-2">
          <button onClick={() => setTool("crop")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0FAF4] text-[#374151] text-sm">
            <Crop className="w-4 h-4" /> Crop
          </button>
          <button onClick={() => setTool("rotation")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0FAF4] text-[#374151] text-sm">
            <RotateCw className="w-4 h-4" /> Rotate
          </button>
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => handleZoom(1 / 1.4)} className="p-2 bg-[#F0FAF4] rounded-lg text-[#374151]">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-[#4DB371] w-10 text-center">{(current.zoom * 100).toFixed(0)}%</span>
            <button onClick={() => handleZoom(1.4)} className="p-2 bg-[#F0FAF4] rounded-lg text-[#374151]">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-[#FAFAFA] text-[#1A2332] flex flex-col" style={{ height: "100dvh" }}>
      {/* Header */}
      <header className="border-b border-[#D4E5DC] px-3 md:px-5 py-2 md:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-lg border-2 border-[#4DB371] bg-white flex items-center justify-center flex-shrink-0" />
          <h1
            className="text-[#68F299] leading-none"
            style={{ fontFamily: "'Oi', cursive", fontSize: "clamp(16px, 3.5vw, 24px)" }}
          >
            Mint Metrics
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Front/Back tab switcher — desktop */}
          {hasAnyImage && (
            <div className="hidden md:flex gap-1 bg-[#F0FAF4] rounded-lg p-0.5">
              {(["front", "back"] as Side[]).map((side) => (
                <button
                  key={side}
                  onClick={() => { setActiveSide(side); setTool("none"); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                    activeSide === side ? "bg-[#4DB371] text-white" : "text-[#6B7280] hover:text-[#1A2332]"
                  }`}
                >
                  {side}
                  {(side === "front" ? front : back).imageDataUrl && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-current inline-block opacity-60" />
                  )}
                </button>
              ))}
            </div>
          )}
          {/* Front/Back compact switcher — mobile */}
          {hasAnyImage && (
            <div className="flex md:hidden gap-1 bg-[#F0FAF4] rounded-lg p-0.5">
              {(["front", "back"] as Side[]).map((side) => (
                <button
                  key={side}
                  onClick={() => { setActiveSide(side); setTool("none"); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    activeSide === side ? "bg-[#4DB371] text-white" : "text-[#6B7280]"
                  }`}
                >
                  {side[0].toUpperCase()}
                  {(side === "front" ? front : back).imageDataUrl && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-current inline-block opacity-60" />
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="w-8 h-8 rounded-lg border border-[#C8DDD0] bg-[#F0FAF4] hover:bg-[#E5F5EC] flex items-center justify-center transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode
              ? <Sun className="w-4 h-4 text-[#4DB371]" />
              : <Moon className="w-4 h-4 text-[#6B7280]" />
            }
          </button>
        </div>
      </header>



      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 md:p-6" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded-2xl border border-[#C8DDD0] p-5 md:p-6 max-w-md w-full space-y-4 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1A2332] text-lg">How to Use</h2>
              <button onClick={() => setHelpOpen(false)} className="text-[#6B7280] hover:text-[#1A2332] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-[#374151]">
              <div>
                <p className="font-semibold text-[#1A2332] mb-1">1. Upload your card images</p>
                <p>Take a photo of the front and back of your trading card. Upload each image using the drop zones or file picker. You can use just one side if you prefer.</p>
                <p className="mt-1">Once both sides are uploaded, use the <span className="font-medium">Front / Back toggle in the top-right of the header</span> to switch between them at any time.</p>
              </div>

              <div>
                <p className="font-semibold text-[#1A2332] mb-1">2. Align the handles</p>
                <p>You'll see 8 colored lines on your card image. Drag each line to match the card's edges:</p>
                <ul className="mt-1 ml-4 space-y-0.5 list-disc">
                  <li><span className="text-[#1A7A42] font-medium">Dark green lines</span> — align to the physical card edge (where the card is cut)</li>
                  <li><span className="text-[#4DB371] font-medium">Mint dashed lines</span> — align to the inner printed border</li>
                </ul>
                <p className="mt-1">Use pinch-to-zoom or scroll to zoom in for pixel-level accuracy.</p>
              </div>

              <div>
                <p className="font-semibold text-[#1A2332] mb-1">3. View your centering results</p>
                <p>Once handles are placed, you'll see left/right and top/bottom centering percentages with estimated grades across PSA, BGS, CGC, TAG, and ACE.</p>
              </div>


              <div className="border-t border-[#D4E5DC] pt-3">
                <p className="font-semibold text-[#1A2332] mb-1">Export</p>
                <p>Use the <span className="font-medium">Export</span> button to download your results as an image.</p>
              </div>
            </div>

            <button
              onClick={() => setHelpOpen(false)}
              className="w-full py-2 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Export modal */}
      {exportUrl && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 md:p-6">
          <div className="bg-white rounded-2xl border border-[#C8DDD0] p-4 md:p-6 max-w-lg w-full space-y-4 max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-[#1A2332] text-lg">Export Ready</h2>
              <button onClick={() => setExportUrl(null)} className="text-[#6B7280] hover:text-[#1A2332] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image — long-press on iOS shows "Save to Photos" natively */}
            <div className="overflow-auto flex-1 min-h-0 flex flex-col gap-2">
              <img
                src={exportUrl}
                alt="Export"
                className="w-full rounded-xl border border-[#C8DDD0] select-none"
                style={{ WebkitTouchCallout: "default" } as React.CSSProperties}
              />
              <p className="text-center text-xs text-[#8899AA] md:hidden">
                Hold the image above to save it to your gallery
              </p>
            </div>

            {/* Desktop: plain download link */}
            <a
              href={exportUrl}
              download="card-centering-result.jpg"
              className="hidden md:flex items-center justify-center gap-2 w-full py-2.5 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded-lg font-medium transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Download JPEG
            </a>

            {/* Mobile: Web Share API → sends to share sheet where "Save to Photos" or
                "Save Image" lets the user drop it straight into the gallery.
                Falls back to a regular download link if the API isn't available. */}
            <button
              onClick={async () => {
                try {
                  const blob = await fetch(exportUrl).then((r) => r.blob());
                  const file = new File([blob], "card-centering-result.jpg", { type: "image/jpeg" });
                  if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: "Card Centering Result" });
                    return;
                  }
                } catch (_) { /* share cancelled or unavailable */ }
                // Fallback: trigger download
                const a = document.createElement("a");
                a.href = exportUrl;
                a.download = "card-centering-result.jpg";
                a.click();
              }}
              className="md:hidden flex items-center justify-center gap-2 w-full py-2.5 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded-lg font-medium transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Save to Gallery
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE LAYOUT ─────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {mobileTab === "upload" && (
            <div className="flex flex-col gap-3 p-4 min-h-full">
              <button
                onClick={() => setHelpOpen(true)}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E5F5EC] hover:bg-[#D4E5DC] border border-[#C8DDD0] text-xs font-medium text-[#4DB371] transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" /> How to use
              </button>
              {uploadZoneLarge("front", true)}
              {uploadZoneLarge("back", true)}
              {historyPanel()}
              <div className="pt-1 pb-2 space-y-2">
                {cacheToggle}
              </div>
            </div>
          )}
          {mobileTab === "measure" && canvasSection()}
          {mobileTab === "results" && (
            <div className="p-3 space-y-3">
              {front.imageDataUrl || back.imageDataUrl ? (
                <>
                  {front.result && <CenteringResults result={front.result} side="Front" />}
                  {back.result && <CenteringResults result={back.result} side="Back" />}
                  {(front.result || back.result) && (
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#4DB371] hover:bg-[#3DA063] disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                    >
                      <Download className="w-4 h-4" />
                      {exporting ? "Generating…" : "Export Image"}
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8899AA] text-sm text-center">
                  <BarChart2 className="w-10 h-10 opacity-40" />
                  <p>Upload an image to get started</p>
                  <button
                    onClick={() => setMobileTab("upload")}
                    className="px-4 py-2 bg-[#4DB371] text-white rounded-lg text-sm font-medium mt-2"
                  >
                    Upload Image
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom tab bar — 3 tabs */}
        <div className="flex-shrink-0 border-t border-[#D4E5DC] bg-[#FAFAFA] grid grid-cols-3 safe-area-bottom">
          {([
            { tab: "upload"  as MobileTab, icon: Home,        label: "Home"    },
            { tab: "measure" as MobileTab, icon: Crosshair,  label: "Measure" },
            { tab: "results" as MobileTab, icon: BarChart2,  label: "Results" },
          ]).map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`relative flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                mobileTab === tab ? "text-[#4DB371]" : "text-[#8899AA]"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
              {mobileTab === tab && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#4DB371]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-56 border-r border-[#D4E5DC] flex flex-col gap-3 p-3 overflow-y-auto flex-shrink-0">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Home className="w-3.5 h-3.5 text-[#8899AA]" />
              <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide">Home</p>
            </div>
            <div className="space-y-2">
              {uploadZoneSmall("front")}
              {uploadZoneSmall("back")}
            </div>
          </div>

          {current.imageDataUrl && (
            <div>
              <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide mb-1.5">Tools</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setTool(tool === "crop" ? "none" : "crop")}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tool === "crop" ? "bg-[#4DB371] text-white" : "bg-[#F0FAF4] text-[#6B7280] hover:bg-[#E5F5EC]"
                  }`}
                >
                  <Crop className="w-4 h-4" />
                  Crop
                </button>
                <button
                  onClick={() => setTool(tool === "rotation" ? "none" : "rotation")}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tool === "rotation" ? "bg-[#4DB371] text-white" : "bg-[#F0FAF4] text-[#6B7280] hover:bg-[#E5F5EC]"
                  }`}
                >
                  <RotateCw className="w-4 h-4" />
                  Rotate
                </button>
              </div>
            </div>
          )}

          {current.imageDataUrl && tool === "none" && (
            <div>
              <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide mb-1.5">Zoom</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleZoom(1 / 1.4)} className="p-1.5 bg-[#F0FAF4] hover:bg-[#E5F5EC] rounded text-[#374151]">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1 text-center text-sm font-mono text-[#4DB371]">{(current.zoom * 100).toFixed(0)}%</span>
                <button onClick={() => handleZoom(1.4)} className="p-1.5 bg-[#F0FAF4] hover:bg-[#E5F5EC] rounded text-[#374151]">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1.5 leading-snug">Scroll to zoom · Drag to pan</p>
            </div>
          )}

          {current.imageDataUrl && tool === "none" && (
            <div>
              <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide mb-1.5">Handle Positions (px)</p>
              <div className="text-xs font-mono space-y-0.5">
                {[
                  { label: "L edge", key: "leftEdge" as const, c: "text-[#1A7A42]" },
                  { label: "L inner", key: "leftInner" as const, c: "text-[#4DB371]" },
                  { label: "R inner", key: "rightInner" as const, c: "text-[#4DB371]" },
                  { label: "R edge", key: "rightEdge" as const, c: "text-[#1A7A42]" },
                  { label: "T edge", key: "topEdge" as const, c: "text-[#1A7A42]" },
                  { label: "T inner", key: "topInner" as const, c: "text-[#4DB371]" },
                  { label: "B inner", key: "bottomInner" as const, c: "text-[#4DB371]" },
                  { label: "B edge", key: "bottomEdge" as const, c: "text-[#1A7A42]" },
                ].map(({ label, key, c }) => (
                  <div key={key} className="flex justify-between">
                    <span className={c}>{label}</span>
                    <span className="text-[#374151]">{Math.round(current.handles[key])}</span>
                  </div>
                ))}
                <div className="text-[#9CA3AF] pt-1">{current.imgWidth}×{current.imgHeight}px</div>
              </div>
            </div>
          )}

          {/* History (desktop) */}
          {cacheEnabled && history.length > 0 && (
            <div className="border-t border-[#D4E5DC] pt-3">
              {historyPanel(true)}
            </div>
          )}

          {/* Cache toggle (desktop) — always at bottom */}
          <div className="mt-auto pt-3 space-y-2">
            {cacheToggle}
          </div>
        </div>

        {/* Desktop center */}
        {!current.imageDataUrl ? (
          <div className="flex-1 flex items-center justify-center gap-6 p-6 min-h-0 relative">
            <button
              onClick={() => setHelpOpen(true)}
              className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/90 border border-[#C8DDD0] hover:bg-[#E5F5EC] flex items-center justify-center transition-colors shadow-sm"
              title="How to use"
            >
              <HelpCircle className="w-4 h-4 text-[#4DB371]" />
            </button>
            {uploadZoneLarge("front")}
            {uploadZoneLarge("back")}
          </div>
        ) : (
          canvasSection()
        )}

        {/* Right panel */}
        <div className="w-64 border-l border-[#D4E5DC] flex flex-col gap-3 p-3 overflow-y-auto flex-shrink-0">
          {hasResult && current.result ? (
            <>
              <CenteringResults result={current.result} side={activeSide === "front" ? "Front" : "Back"} />

              {front.result && back.result && (
                <div className="rounded-xl border border-[#C8DDD0] bg-white p-3 space-y-2">
                  <p className="text-xs font-semibold text-[#8899AA] uppercase tracking-wide">Both Sides</p>
                  {(["front", "back"] as Side[]).map((side) => {
                    const s = side === "front" ? front : back;
                    if (!s.result) return null;
                    return (
                      <div key={side} className="space-y-0.5">
                        <p className="text-xs font-medium text-[#6B7280] capitalize">{side}</p>
                        <div className="flex gap-2 text-xs font-mono">
                          <span className="text-[#374151]">L/R {s.result.leftPercent.toFixed(1)}/{s.result.rightPercent.toFixed(1)}</span>
                          <span className="text-[#9CA3AF]">·</span>
                          <span className="text-[#374151]">T/B {s.result.topPercent.toFixed(1)}/{s.result.bottomPercent.toFixed(1)}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {(["psa", "bgs", "cgc"] as Array<keyof typeof s.result.graderGrades>).map((k) => {
                            const g = s.result!.graderGrades[k];
                            return (
                              <span key={k} className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: g.color, background: g.color + "22" }}>
                                {k.toUpperCase()} {g.numeric}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-xl border border-[#C8DDD0] bg-white/50 p-3 text-xs text-[#8899AA] space-y-1">
                <p className="font-semibold text-[#6B7280] mb-1">How to use</p>
                <div className="space-y-1">
                  <p><span className="text-[#1A7A42] font-medium">Dark green</span> = physical card edge</p>
                  <p><span className="text-[#4DB371] font-medium">Mint</span> = inner printed border</p>
                  <p className="pt-1">Centering is calculated from the mint inner handles. Click and drag anywhere along a line to move it. Scroll to zoom for pixel-level accuracy.</p>
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#4DB371] hover:bg-[#3DA063] disabled:opacity-40 text-white rounded-lg text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                {exporting ? "Generating…" : "Export Image"}
              </button>
            </>
          ) : (
            <div className="text-[#9CA3AF] text-sm text-center py-8">
              <p>{current.imageDataUrl ? "Adjust handles then calculate" : "Load an image to get started"}</p>
            </div>
          )}
        </div>
      </div>


      {/* ── FIRST-VISIT HISTORY CONSENT BANNER ───────────────────────────── */}
      {!consentAsked && (
        <div className="fixed bottom-0 inset-x-0 z-40 safe-area-bottom">
          <div className="bg-white border-t border-[#C8DDD0] px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-2xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1A2332] leading-snug">Save your card history?</p>
              <p className="text-xs text-[#6B7280] mt-0.5 leading-snug">
                Stores your last 6 sessions locally so you can pick up where you left off. Nothing leaves your device.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setCacheEnabled(true);
                  setConsentAsked(true);
                }}
                className="px-4 py-2 bg-[#4DB371] hover:bg-[#3DA063] text-white rounded-lg text-sm font-medium transition-colors"
              >
                Enable history
              </button>
              <button
                onClick={() => setConsentAsked(true)}
                className="px-4 py-2 bg-[#E5F5EC] hover:bg-[#D4E5DC] text-[#374151] rounded-lg text-sm font-medium transition-colors"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

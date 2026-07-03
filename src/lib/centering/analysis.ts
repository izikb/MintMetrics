export interface HandlePositions {
  leftEdge: number;
  leftInner: number;
  rightInner: number;
  rightEdge: number;
  topEdge: number;
  topInner: number;
  bottomInner: number;
  bottomEdge: number;
}

export interface GraderGrade {
  numeric: string;   // e.g. "10", "9.5"
  label: string;     // e.g. "Gem Mint"
  color: string;
}

export interface GraderGrades {
  psa: GraderGrade;
  bgs: GraderGrade;
  cgc: GraderGrade;
  tag: GraderGrade;
  ace: GraderGrade;
}

export interface CenteringResult {
  leftPercent: number;
  rightPercent: number;
  topPercent: number;
  bottomPercent: number;
  leftBorderPx: number;
  rightBorderPx: number;
  topBorderPx: number;
  bottomBorderPx: number;
  lrSpread: number;
  tbSpread: number;
  graderGrades: GraderGrades;
}

export interface RotationAnalysis {
  isRotated: boolean;
  isSkewed: boolean;
  estimatedAngle: number;
  warning: string | null;
}

export function defaultHandles(imgW: number, imgH: number): HandlePositions {
  return {
    leftEdge: Math.round(imgW * 0.03),
    leftInner: Math.round(imgW * 0.10),
    rightInner: Math.round(imgW * 0.90),
    rightEdge: Math.round(imgW * 0.97),
    topEdge: Math.round(imgH * 0.03),
    topInner: Math.round(imgH * 0.10),
    bottomInner: Math.round(imgH * 0.90),
    bottomEdge: Math.round(imgH * 0.97),
  };
}

// ─── Grader Centering Rubrics ────────────────────────────────────────────────
// All thresholds are based on published standards where available.
// spread = abs(leftPercent - rightPercent)  e.g. 55/45 → spread 10
// maxSpread = worst of L/R and T/B spread
// Note: centering is only ONE sub-grade — overall card grade may be lower.

function gradeColor(numeric: string): string {
  const n = parseFloat(numeric);
  if (n >= 10)  return "#22c55e";  // green
  if (n >= 9.5) return "#84cc16";  // lime
  if (n >= 9)   return "#eab308";  // yellow
  if (n >= 8.5) return "#f97316";  // orange
  if (n >= 8)   return "#fb923c";  // orange-red
  if (n >= 7.5) return "#ef4444";  // red
  if (n >= 7)   return "#dc2626";  // darker red
  return "#b91c1c";                // deep red
}

function psaGrade(lrSpread: number, tbSpread: number): GraderGrade {
  // PSA published centering standards (modern cards)
  // Source: PSA grading standards documentation
  const lr = lrSpread, tb = tbSpread;
  if (lr <= 10 && tb <= 10) return { numeric: "10", label: "Gem Mint", color: gradeColor("10") };
  if (lr <= 20 && tb <= 20) return { numeric: "9", label: "Mint", color: gradeColor("9") };
  if (lr <= 30 && tb <= 30) return { numeric: "8", label: "NM-MT", color: gradeColor("8") };
  if (lr <= 40 && tb <= 40) return { numeric: "7", label: "NM", color: gradeColor("7") };
  if (lr <= 50 && tb <= 50) return { numeric: "6", label: "EX-MT", color: gradeColor("6") };
  if (lr <= 60 && tb <= 60) return { numeric: "5", label: "EX", color: gradeColor("5") };
  if (lr <= 70 && tb <= 70) return { numeric: "4", label: "VG-EX", color: gradeColor("4") };
  return { numeric: "≤3", label: "VG or lower", color: "#ef4444" };
}

function bgsGrade(lrSpread: number, tbSpread: number): GraderGrade {
  // BGS/Beckett centering sub-grade standards
  // BGS 10 Pristine requires essentially perfect centering (≤50.5/49.5)
  // BGS 9.5 Gem Mint: 55/45
  // BGS 9 Mint: 60/40
  const max = Math.max(lrSpread, tbSpread);
  if (max <= 2)  return { numeric: "10", label: "Pristine", color: gradeColor("10") };
  if (max <= 10) return { numeric: "9.5", label: "Gem Mint", color: gradeColor("9.5") };
  if (max <= 20) return { numeric: "9", label: "Mint", color: gradeColor("9") };
  if (max <= 30) return { numeric: "8.5", label: "NM-MT+", color: gradeColor("8.5") };
  if (max <= 40) return { numeric: "8", label: "NM-MT", color: gradeColor("8") };
  if (max <= 50) return { numeric: "7.5", label: "NM+", color: gradeColor("7.5") };
  if (max <= 60) return { numeric: "7", label: "NM", color: gradeColor("7") };
  return { numeric: "≤6.5", label: "EX-MT or lower", color: "#ef4444" };
}

function cgcGrade(lrSpread: number, tbSpread: number): GraderGrade {
  // CGC Trading Cards centering standards
  // CGC 10 Pristine: 55/45 or better
  // CGC 9.5 Gem Mint: 60/40 or better
  const max = Math.max(lrSpread, tbSpread);
  if (max <= 10) return { numeric: "10", label: "Pristine", color: gradeColor("10") };
  if (max <= 20) return { numeric: "9.5", label: "Gem Mint", color: gradeColor("9.5") };
  if (max <= 30) return { numeric: "9", label: "Mint", color: gradeColor("9") };
  if (max <= 40) return { numeric: "8.5", label: "Near Mint+", color: gradeColor("8.5") };
  if (max <= 50) return { numeric: "8", label: "Near Mint", color: gradeColor("8") };
  if (max <= 60) return { numeric: "7.5", label: "Very Fine+", color: gradeColor("7.5") };
  if (max <= 70) return { numeric: "7", label: "Very Fine", color: gradeColor("7") };
  return { numeric: "≤6", label: "Fine or lower", color: "#ef4444" };
}

function tagGrade(lrSpread: number, tbSpread: number): GraderGrade {
  // TAG (Trading Card Grading) centering standards
  // TAG 10: ≤55/45 on both axes
  const lr = lrSpread, tb = tbSpread;
  if (lr <= 10 && tb <= 10) return { numeric: "10", label: "Pristine", color: gradeColor("10") };
  if (lr <= 15 && tb <= 15) return { numeric: "9.5", label: "Gem Mint+", color: gradeColor("9.5") };
  if (lr <= 20 && tb <= 20) return { numeric: "9", label: "Gem Mint", color: gradeColor("9") };
  if (lr <= 30 && tb <= 30) return { numeric: "8.5", label: "Mint+", color: gradeColor("8.5") };
  if (lr <= 40 && tb <= 40) return { numeric: "8", label: "Mint", color: gradeColor("8") };
  if (lr <= 50 && tb <= 50) return { numeric: "7", label: "Near Mint", color: gradeColor("7") };
  if (lr <= 60 && tb <= 60) return { numeric: "6", label: "Excellent", color: gradeColor("6") };
  return { numeric: "≤5", label: "Very Good or lower", color: "#ef4444" };
}

function aceGrade(lrSpread: number, tbSpread: number): GraderGrade {
  // ACE (Ace Grading) centering standards
  // ACE 10 Gem Mint: ≤55/45, ACE 9.5: ≤60/40
  const max = Math.max(lrSpread, tbSpread);
  if (max <= 10) return { numeric: "10", label: "Gem Mint", color: gradeColor("10") };
  if (max <= 20) return { numeric: "9.5", label: "Mint+", color: gradeColor("9.5") };
  if (max <= 30) return { numeric: "9", label: "Mint", color: gradeColor("9") };
  if (max <= 40) return { numeric: "8.5", label: "NM+", color: gradeColor("8.5") };
  if (max <= 50) return { numeric: "8", label: "Near Mint", color: gradeColor("8") };
  if (max <= 60) return { numeric: "7", label: "Excellent+", color: gradeColor("7") };
  return { numeric: "≤6", label: "Excellent or lower", color: "#ef4444" };
}

// ─────────────────────────────────────────────────────────────────────────────

export function calculateCentering(handles: HandlePositions): CenteringResult {
  const leftBorderPx = handles.leftInner - handles.leftEdge;
  const rightBorderPx = handles.rightEdge - handles.rightInner;
  const topBorderPx = handles.topInner - handles.topEdge;
  const bottomBorderPx = handles.bottomEdge - handles.bottomInner;

  const lrTotal = leftBorderPx + rightBorderPx;
  const tbTotal = topBorderPx + bottomBorderPx;

  const leftRaw  = lrTotal > 0 ? (leftBorderPx  / lrTotal) * 100 : 50;
  const topRaw   = tbTotal > 0 ? (topBorderPx   / tbTotal) * 100 : 50;
  const leftPercent   = Math.round(leftRaw  * 10) / 10;
  const rightPercent  = Math.round((100 - leftRaw)  * 10) / 10;
  const topPercent    = Math.round(topRaw   * 10) / 10;
  const bottomPercent = Math.round((100 - topRaw)   * 10) / 10;

  const lrSpread = Math.abs(leftPercent - rightPercent);
  const tbSpread = Math.abs(topPercent - bottomPercent);

  return {
    leftPercent,
    rightPercent,
    topPercent,
    bottomPercent,
    leftBorderPx,
    rightBorderPx,
    topBorderPx,
    bottomBorderPx,
    lrSpread,
    tbSpread,
    graderGrades: {
      psa: psaGrade(lrSpread, tbSpread),
      bgs: bgsGrade(lrSpread, tbSpread),
      cgc: cgcGrade(lrSpread, tbSpread),
      tag: tagGrade(lrSpread, tbSpread),
      ace: aceGrade(lrSpread, tbSpread),
    },
  };
}

export async function analyzeRotation(imageData: ImageData): Promise<RotationAnalysis> {
  const { data, width, height } = imageData;

  // Build grayscale buffer
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Estimate background brightness from the outer ring of pixels.
  // Works when the card is photographed on a contrasting surface.
  const ringW = Math.max(2, Math.round(Math.min(width, height) * 0.025));
  const bgSamples: number[] = [];
  for (let x = 0; x < width; x++) {
    for (let r = 0; r < ringW; r++) {
      bgSamples.push(gray[r * width + x]);
      bgSamples.push(gray[(height - 1 - r) * width + x]);
    }
  }
  for (let y = ringW; y < height - ringW; y++) {
    for (let r = 0; r < ringW; r++) {
      bgSamples.push(gray[y * width + r]);
      bgSamples.push(gray[y * width + (width - 1 - r)]);
    }
  }
  bgSamples.sort((a, b) => a - b);
  const bgMedian = bgSamples[Math.floor(bgSamples.length / 2)] ?? 128;

  // If background pixels span a wide brightness range the image is probably
  // a flat scan with no distinct background — skip rotation detection.
  const bgQ25 = bgSamples[Math.floor(bgSamples.length * 0.25)] ?? 0;
  const bgQ75 = bgSamples[Math.floor(bgSamples.length * 0.75)] ?? 255;
  const bgContrast = bgQ75 - bgQ25;
  if (bgContrast > 60) {
    // Background is not uniform — looks like flat scan, no rotation to detect
    return { isRotated: false, isSkewed: false, estimatedAngle: 0, warning: null };
  }

  // Work out whether the background is light or dark, then set a threshold
  // that marks pixels clearly belonging to the card (the opposite tone).
  // A card on a white table → background bright → card pixels are darker.
  // A card on a dark surface → background dark   → card pixels are brighter.
  const isLightBackground = bgMedian > 127;
  const CONTRAST_MARGIN = 30;

  // isCard: returns true when a pixel's brightness belongs to the card, not the bg.
  const isCard = (brightness: number): boolean =>
    isLightBackground
      ? brightness < bgMedian - CONTRAST_MARGIN  // card is darker than light bg
      : brightness > bgMedian + CONTRAST_MARGIN; // card is brighter than dark bg

  // For each sampled row, find where the LEFT edge of the card starts.
  // Scan inward from both the left and right sides; use whichever gives more points.
  const stepY = Math.max(1, Math.floor(height / 50));
  const margin = Math.floor(Math.min(width, height) * 0.05);
  const edgePoints: { x: number; y: number }[] = [];

  for (let y = margin; y < height - margin; y += stepY) {
    // Scan left→right for the background→card transition
    for (let x = margin; x < width * 0.5; x++) {
      if (isCard(gray[y * width + x])) {
        edgePoints.push({ x, y });
        break;
      }
    }
  }

  // Need enough points for a meaningful regression
  if (edgePoints.length < 6) {
    // Card fills the frame (flat scan) or no clear edge found — assume no rotation
    return { isRotated: false, isSkewed: false, estimatedAngle: 0, warning: null };
  }

  // Linear regression: x = slope * y + intercept
  // slope = dx/dy; rotation angle = atan(slope)
  const n = edgePoints.length;
  const meanY = edgePoints.reduce((s, p) => s + p.y, 0) / n;
  const meanX = edgePoints.reduce((s, p) => s + p.x, 0) / n;
  let num = 0, den = 0;
  for (const p of edgePoints) {
    num += (p.y - meanY) * (p.x - meanX);
    den += (p.y - meanY) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const estimatedAngle = Math.atan(slope) * (180 / Math.PI);

  // Compute how well the edge points fit a straight line (residual std dev).
  // High residuals → the left edge is not a straight line → skew, not rotation.
  const residuals = edgePoints.map(p => p.x - (slope * (p.y - meanY) + meanX));
  const residStd = Math.sqrt(residuals.reduce((s, r) => s + r ** 2, 0) / n);
  const normalizedResidStd = width > 0 ? residStd / width : 0;

  const isRotated = Math.abs(estimatedAngle) > 4;
  const isSkewed = normalizedResidStd > 0.06 && !isRotated;

  let warning: string | null = null;
  if (isSkewed) {
    warning = "Image appears skewed or distorted. Results may be inaccurate. Please re-photograph on a flat surface — skew cannot be corrected in-app.";
  } else if (isRotated) {
    warning = `Image appears rotated by ~${estimatedAngle.toFixed(1)}°. Use the Rotate tool to correct before measuring.`;
  }

  return { isRotated, isSkewed, estimatedAngle, warning };
}

export async function exportResultImage(
  canvas: HTMLCanvasElement,
  handles: HandlePositions,
  result: CenteringResult,
  side: string
): Promise<string> {
  // ── Layout constants ──────────────────────────────────────────────────────
  const PAD = 20;
  const HEADER_H = 52;
  const STATS_W = 320;
  const MAX_CARD_H = 500;

  // Scale card image down so we don't produce multi-MB files
  const scaleRatio = Math.min(1, MAX_CARD_H / canvas.height);
  const cardW = Math.round(canvas.width * scaleRatio);
  const cardH = Math.round(canvas.height * scaleRatio);

  // Pre-calculate stats column height so we can size the canvas correctly:
  //   numbers box (96) + gap (10) + bars box (68) + gap (10)
  //   + measurements box (54) + gap (10)
  //   + grade header (24) + 5 rows × 34 (170) + disclaimer (26) + gap (10) + legend (16)
  const STATS_CONTENT_H = 96 + 10 + 68 + 10 + 54 + 10 + 24 + 170 + 26 + 10 + 16;

  const contentH = Math.max(cardH, STATS_CONTENT_H);
  const panelW = PAD + cardW + PAD + STATS_W + PAD;
  const panelH = HEADER_H + PAD + contentH + PAD;

  const ec = document.createElement("canvas");
  ec.width = panelW;
  ec.height = panelH;
  const ctx = ec.getContext("2d")!;

  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(0, 0, panelW, panelH);

  ctx.fillStyle = "#F0FAF4";
  ctx.fillRect(0, 0, panelW, HEADER_H);

  ctx.font = "bold 22px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1A2332";
  ctx.fillText(`${side} — Centering Analysis`, PAD, HEADER_H / 2);

  ctx.font = "bold 15px monospace";
  ctx.fillStyle = "#4DB371";
  ctx.textAlign = "right";
  ctx.fillText(
    `L/R ${result.leftPercent.toFixed(1)}/${result.rightPercent.toFixed(1)}  ·  T/B ${result.topPercent.toFixed(1)}/${result.bottomPercent.toFixed(1)}`,
    panelW - PAD,
    HEADER_H / 2,
  );

  // ── Card image (scaled) ───────────────────────────────────────────────────
  const imgX = PAD;
  const imgY = HEADER_H + PAD;
  ctx.drawImage(canvas, imgX, imgY, cardW, cardH);

  // "Mint Metrics" branding on card image
  {
    const brandSize = Math.max(12, Math.round(cardW * 0.055));
    ctx.save();
    ctx.font = `${brandSize}px 'Oi', cursive`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(26, 122, 66, 0.5)";
    ctx.fillText("Mint Metrics", imgX + cardW / 2, imgY + brandSize * 0.3);
    ctx.restore();
  }

  // Handle overlay lines
  const sx = (x: number) => imgX + x * scaleRatio;
  const sy = (y: number) => imgY + y * scaleRatio;
  const iTop = imgY, iBot = imgY + cardH, iLeft = imgX, iRight = imgX + cardW;

  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, dash: number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  drawLine(sx(handles.leftEdge),  iTop, sx(handles.leftEdge),  iBot, "#1A7A42");
  drawLine(sx(handles.rightEdge), iTop, sx(handles.rightEdge), iBot, "#1A7A42");
  drawLine(iLeft, sy(handles.topEdge),    iRight, sy(handles.topEdge),    "#1A7A42");
  drawLine(iLeft, sy(handles.bottomEdge), iRight, sy(handles.bottomEdge), "#1A7A42");
  drawLine(sx(handles.leftInner),  iTop, sx(handles.leftInner),  iBot, "#4DB371", [5, 3]);
  drawLine(sx(handles.rightInner), iTop, sx(handles.rightInner), iBot, "#4DB371", [5, 3]);
  drawLine(iLeft, sy(handles.topInner),    iRight, sy(handles.topInner),    "#4DB371", [5, 3]);
  drawLine(iLeft, sy(handles.bottomInner), iRight, sy(handles.bottomInner), "#4DB371", [5, 3]);
  ctx.setLineDash([]);

  // Percentage labels on card
  const midX = (sx(handles.leftInner) + sx(handles.rightInner)) / 2;
  const midY = (sy(handles.topInner)  + sy(handles.bottomInner)) / 2;
  const labelColor = (pct: number) =>
    Math.abs(pct - 50) > 12 ? "#f87171" : Math.abs(pct - 50) > 5 ? "#fb923c" : "#4ade80";

  const drawPctLabel = (text: string, x: number, y: number, align: CanvasTextAlign, color: string) => {
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  };

  drawPctLabel(`${result.leftPercent.toFixed(1)}%`,   sx(handles.leftInner)  - 5, midY, "right",  labelColor(result.leftPercent));
  drawPctLabel(`${result.rightPercent.toFixed(1)}%`,  sx(handles.rightInner) + 5, midY, "left",   labelColor(result.rightPercent));
  drawPctLabel(`${result.topPercent.toFixed(1)}%`,    midX, sy(handles.topInner)    - 8, "center", labelColor(result.topPercent));
  drawPctLabel(`${result.bottomPercent.toFixed(1)}%`, midX, sy(handles.bottomInner) + 10, "center", labelColor(result.bottomPercent));

  // ── Stats column ──────────────────────────────────────────────────────────
  const statsX = imgX + cardW + PAD;
  const bW = STATS_W - PAD; // usable width inside stats column
  let sy2 = HEADER_H + PAD;

  // Helper: rounded rect fill
  const fillRRect = (x: number, y: number, w: number, h: number, r: number | number[], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r as number);
    ctx.fill();
  };

  fillRRect(statsX, sy2, bW, 96, 8, "#F0FAF4");

  ctx.font = "bold 9px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#6B7280";
  ctx.fillText("CENTERING", statsX + 10, sy2 + 12);

  const halfW = (bW - 32) / 2;

  fillRRect(statsX + 10, sy2 + 22, halfW, 62, 6, "#FFFFFF");
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.textAlign = "center";
  ctx.fillText("Left / Right", statsX + 10 + halfW / 2, sy2 + 34);
  ctx.font = "bold 18px monospace";
  ctx.fillStyle = "#4DB371";
  ctx.fillText(`${result.leftPercent.toFixed(1)}/${result.rightPercent.toFixed(1)}`, statsX + 10 + halfW / 2, sy2 + 56);

  const tbX = statsX + 10 + halfW + 12;
  fillRRect(tbX, sy2 + 22, halfW, 62, 6, "#FFFFFF");
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.textAlign = "center";
  ctx.fillText("Top / Bottom", tbX + halfW / 2, sy2 + 34);
  ctx.font = "bold 18px monospace";
  ctx.fillStyle = "#4DB371";
  ctx.fillText(`${result.topPercent.toFixed(1)}/${result.bottomPercent.toFixed(1)}`, tbX + halfW / 2, sy2 + 56);

  sy2 += 96 + 10;

  // ── Centering bars ────────────────────────────────────────────────────────
  fillRRect(statsX, sy2, bW, 68, 8, "#F0FAF4");

  const drawBar = (label: string, pct: number, bx: number, by: number, bw: number) => {
    const spread = Math.abs(pct - 50);
    const barColor = spread > 15 ? "#ef4444" : spread > 7 ? "#f97316" : "#4DB371";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx, by);
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = barColor;
    ctx.textAlign = "right";
    ctx.fillText(`${pct.toFixed(1)}% / ${(100 - pct).toFixed(1)}%`, bx + bw, by);
    const barY = by + 8;
    fillRRect(bx, barY, bw, 7, 3, "#E5F5EC");
    fillRRect(bx, barY, Math.max(4, bw * (pct / 100)), 7, 3, barColor);
    ctx.fillStyle = "#C8DDD0";
    ctx.fillRect(bx + bw * 0.5 - 0.5, barY, 1, 7);
  };

  drawBar("L ← → R", result.leftPercent, statsX + 10, sy2 + 18, bW - 20);
  drawBar("T ↑ ↓ B", result.topPercent,  statsX + 10, sy2 + 46, bW - 20);

  sy2 += 68 + 10;

  // ── Pixel measurements ────────────────────────────────────────────────────
  fillRRect(statsX, sy2, bW, 54, 8, "#F0FAF4");

  const measurements = [
    { label: "L", value: result.leftBorderPx },
    { label: "R", value: result.rightBorderPx },
    { label: "T", value: result.topBorderPx },
    { label: "B", value: result.bottomBorderPx },
  ];
  const colW = (bW - 24) / 2;
  measurements.forEach((m, i) => {
    const mx = statsX + 10 + (i % 2) * (colW + 12);
    const my = sy2 + 18 + Math.floor(i / 2) * 22;
    ctx.font = "11px monospace";
    ctx.fillStyle = "#9CA3AF";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(m.label, mx, my);
    ctx.fillStyle = "#4A5568";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(m.value)}px`, mx + colW, my);
  });

  sy2 += 54 + 10;

  // ── Grader grade table ────────────────────────────────────────────────────
  const GRADERS = ["PSA", "BGS", "CGC", "TAG", "ACE"] as const;
  const GRADES = [
    result.graderGrades.psa,
    result.graderGrades.bgs,
    result.graderGrades.cgc,
    result.graderGrades.tag,
    result.graderGrades.ace,
  ];
  const ROW_H = 34;

  fillRRect(statsX, sy2, bW, 24, [8, 8, 0, 0], "#E5F5EC");
  ctx.font = "bold 9px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("CENTERING GRADE ESTIMATE", statsX + 10, sy2 + 12);
  sy2 += 24;

  for (let i = 0; i < GRADERS.length; i++) {
    const g = GRADES[i];
    const ry = sy2 + i * ROW_H;
    ctx.fillStyle = i % 2 === 0 ? "#FFFFFF" : "#F5FBF7";
    ctx.fillRect(statsX, ry, bW, ROW_H);
    ctx.fillStyle = g.color;
    ctx.fillRect(statsX, ry, 3, ROW_H);
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(GRADERS[i], statsX + 12, ry + ROW_H / 2);
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = g.color;
    ctx.textAlign = "center";
    ctx.fillText(g.numeric, statsX + bW * 0.48, ry + ROW_H / 2);
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.textAlign = "left";
    ctx.fillText(g.label, statsX + bW * 0.62, ry + ROW_H / 2);
  }
  sy2 += GRADERS.length * ROW_H;

  fillRRect(statsX, sy2, bW, 26, [0, 0, 8, 8], "#F0FAF4");
  ctx.font = "9px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#9CA3AF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("* Centering sub-grade only — overall grade may differ.", statsX + 10, sy2 + 13);
  sy2 += 26 + 10;

  const drawLegLine = (lx: number, ly: number, color: string, dash: number[], label: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 20, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx + 26, ly);
  };
  drawLegLine(statsX,       sy2, "#1A7A42", [],     "Card edge");
  drawLegLine(statsX + 110, sy2, "#4DB371", [5, 3], "Printed border");

  // Output as JPEG — dramatically smaller than PNG for photographic content
  return ec.toDataURL("image/jpeg", 0.88);
}

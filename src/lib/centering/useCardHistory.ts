import { useState, useCallback } from "react";
import type { HandlePositions, CenteringResult } from "./analysis";

const KEY_ENABLED  = "card-centering:cache-enabled";
const KEY_HISTORY  = "card-centering:history";
const KEY_ASKED    = "card-centering:consent-asked";
const MAX_SESSIONS = 6;
const COMPRESS_MAX_W = 640;
const COMPRESS_QUALITY = 0.72;

export interface SavedSide {
  imageDataUrl: string;
  handles: HandlePositions;
  result: CenteringResult;
  imgWidth: number;
  imgHeight: number;
}

export interface SavedSession {
  id: string;
  timestamp: number;
  front?: SavedSide;
  back?: SavedSide;
}

async function compressForStorage(
  dataUrl: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, COMPRESS_MAX_W / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: c.toDataURL("image/jpeg", COMPRESS_QUALITY), width: w, height: h });
    };
    img.src = dataUrl;
  });
}

function scaleHandles(
  handles: HandlePositions,
  scaleX: number,
  scaleY: number
): HandlePositions {
  return {
    leftEdge: handles.leftEdge * scaleX,
    leftInner: handles.leftInner * scaleX,
    rightInner: handles.rightInner * scaleX,
    rightEdge: handles.rightEdge * scaleX,
    topEdge: handles.topEdge * scaleY,
    topInner: handles.topInner * scaleY,
    bottomInner: handles.bottomInner * scaleY,
    bottomEdge: handles.bottomEdge * scaleY,
  };
}

function readHistory(): SavedSession[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(sessions: SavedSession[]) {
  try {
    localStorage.setItem(KEY_HISTORY, JSON.stringify(sessions));
  } catch {
    // quota exceeded — silently skip
  }
}

export type HistorySideInput = {
  imageDataUrl: string | null;
  handles: HandlePositions;
  result: CenteringResult | null;
  imgWidth: number;
  imgHeight: number;
} | null;

export function useCardHistory() {
  // Has the user already been shown the first-visit consent banner?
  const [consentAsked, _setConsentAsked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_ASKED) === "true";
    } catch {
      return false;
    }
  });

  const setConsentAsked = useCallback((asked: boolean) => {
    _setConsentAsked(asked);
    try {
      localStorage.setItem(KEY_ASKED, asked ? "true" : "false");
    } catch {}
  }, []);

  const [cacheEnabled, _setCacheEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_ENABLED) === "true";
    } catch {
      return false;
    }
  });

  const [history, setHistory] = useState<SavedSession[]>(() => {
    try {
      return localStorage.getItem(KEY_ENABLED) === "true" ? readHistory() : [];
    } catch {
      return [];
    }
  });

  const setCacheEnabled = useCallback((enabled: boolean) => {
    _setCacheEnabled(enabled);
    try {
      localStorage.setItem(KEY_ENABLED, enabled ? "true" : "false");
    } catch {}
    if (enabled) {
      setHistory(readHistory());
    } else {
      setHistory([]);
      try {
        localStorage.removeItem(KEY_HISTORY);
      } catch {}
    }
  }, []);

  const upsertSession = useCallback(
    async (id: string, frontInput: HistorySideInput, backInput: HistorySideInput) => {
      if (!cacheEnabled) return;

      const buildSide = async (d: HistorySideInput): Promise<SavedSide | undefined> => {
        if (!d?.imageDataUrl || !d.result) return undefined;
        const { dataUrl, width, height } = await compressForStorage(d.imageDataUrl);
        const scaleX = width / d.imgWidth;
        const scaleY = height / d.imgHeight;
        return {
          imageDataUrl: dataUrl,
          handles: scaleHandles(d.handles, scaleX, scaleY),
          result: d.result,
          imgWidth: width,
          imgHeight: height,
        };
      };

      const [savedFront, savedBack] = await Promise.all([
        buildSide(frontInput),
        buildSide(backInput),
      ]);

      if (!savedFront && !savedBack) return;

      setHistory((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        const session: SavedSession = {
          id,
          timestamp: Date.now(),
          front: savedFront,
          back: savedBack,
        };
        const updated =
          idx >= 0
            ? prev.map((s) => (s.id === id ? session : s))
            : [session, ...prev].slice(0, MAX_SESSIONS);
        writeHistory(updated);
        return updated;
      });
    },
    [cacheEnabled]
  );

  const deleteSession = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      writeHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(KEY_HISTORY);
    } catch {}
  }, []);

  return { consentAsked, setConsentAsked, cacheEnabled, setCacheEnabled, history, upsertSession, deleteSession, clearHistory };
}

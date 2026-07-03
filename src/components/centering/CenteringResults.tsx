import type { CenteringResult } from "@/lib/centering/analysis";

interface CenteringResultsProps {
  result: CenteringResult;
  side: string;
}

const GRADERS = [
  { key: "psa" as const, name: "PSA" },
  { key: "bgs" as const, name: "BGS" },
  { key: "cgc" as const, name: "CGC" },
  { key: "tag" as const, name: "TAG" },
  { key: "ace" as const, name: "ACE" },
];

function Bar({ pct, label }: { pct: number; label: string }) {
  const spread = Math.abs(pct - 50);
  const color = spread > 15 ? "#ef4444" : spread > 7 ? "#f97316" : "#4DB371";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[#6B7280]">
        <span>{label}</span>
        <span className="font-mono" style={{ color }}>
          {pct.toFixed(1)}% / {(100 - pct).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full bg-[#E5F5EC] rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-[#9CA3AF]/40" style={{ left: "50%" }} />
      </div>
    </div>
  );
}

export default function CenteringResults({ result, side }: CenteringResultsProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-[#C8DDD0] bg-white p-3 space-y-2.5">
        <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">{side} Centering</h3>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#F0FAF4] p-2.5 text-center">
            <div className="text-xs text-[#6B7280] mb-0.5">Left / Right</div>
            <div className="text-xl font-bold font-mono text-[#4DB371] leading-none">
              {result.leftPercent.toFixed(1)}/{result.rightPercent.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg bg-[#F0FAF4] p-2.5 text-center">
            <div className="text-xs text-[#6B7280] mb-0.5">Top / Bottom</div>
            <div className="text-xl font-bold font-mono text-[#4DB371] leading-none">
              {result.topPercent.toFixed(1)}/{result.bottomPercent.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Bar pct={result.leftPercent} label="L ← → R" />
          <Bar pct={result.topPercent} label="T ↑ ↓ B" />
        </div>

        <div className="grid grid-cols-2 gap-x-2 text-xs font-mono pt-1 border-t border-[#E5F5EC]">
          <div className="flex justify-between text-[#9CA3AF]">
            <span>L</span><span className="text-[#4A5568]">{Math.round(result.leftBorderPx)}px</span>
          </div>
          <div className="flex justify-between text-[#9CA3AF]">
            <span>R</span><span className="text-[#4A5568]">{Math.round(result.rightBorderPx)}px</span>
          </div>
          <div className="flex justify-between text-[#9CA3AF]">
            <span>T</span><span className="text-[#4A5568]">{Math.round(result.topBorderPx)}px</span>
          </div>
          <div className="flex justify-between text-[#9CA3AF]">
            <span>B</span><span className="text-[#4A5568]">{Math.round(result.bottomBorderPx)}px</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#C8DDD0] bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-[#D4E5DC]">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Centering Grade Estimate</p>
        </div>
        <div className="divide-y divide-[#E5F5EC]">
          {GRADERS.map(({ key, name }) => {
            const g = result.graderGrades[key];
            return (
              <div key={key} className="flex items-center px-3 py-2 gap-3">
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-sm font-bold text-[#374151] w-8 flex-shrink-0">{name}</span>
                <span className="text-xl font-black font-mono flex-shrink-0 w-12" style={{ color: g.color }}>
                  {g.numeric}
                </span>
                <span className="text-xs text-[#6B7280] truncate">{g.label}</span>
              </div>
            );
          })}
        </div>
        <div className="px-3 py-2 border-t border-[#E5F5EC] bg-[#F0FAF4]/50">
          <p className="text-xs text-[#9CA3AF] leading-snug">
            Centering sub-grade only — overall card grade may be lower due to corners, edges, surface.
          </p>
        </div>
      </div>
    </div>
  );
}

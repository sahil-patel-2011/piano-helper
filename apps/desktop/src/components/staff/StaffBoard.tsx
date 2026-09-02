const LETTERS = "CDEFGAB";

function stepBelowF5(pitch: string): number {
  const letter = pitch[0] ?? "C";
  const octave = Number(pitch.replace(/[^0-9]/g, "") || "4");
  const idx = Math.max(0, LETTERS.indexOf(letter));
  return 5 * 7 + 3 - (octave * 7 + idx);
}

function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  if (step > 8) {
    for (let s = 10; s <= step; s += 2) out.push(s);
  }
  if (step < 0) {
    for (let s = -2; s >= step; s -= 2) out.push(s);
  }
  return out;
}

type Props = {
  pitches: string[];
  compact?: boolean;
  showNames?: boolean;
};

export function StaffBoard({ pitches, compact = false, showNames = true }: Props) {
  const lineGap = compact ? 16 : 26;
  const padTop = compact ? 28 : 44;
  const padX = compact ? 64 : 92;
  const noteW = compact ? 22 : 34;
  const noteH = compact ? 16 : 24;
  const staffH = lineGap * 4;
  const steps = pitches.map(stepBelowF5);
  const minStep = steps.length ? Math.min(...steps, 0) : 0;
  const maxStep = steps.length ? Math.max(...steps, 8) : 8;
  const extraTop = Math.max(0, -minStep) * (lineGap / 2);
  const extraBot = Math.max(0, maxStep - 8) * (lineGap / 2);
  const height = padTop + extraTop + staffH + extraBot + padTop * 0.55;

  return (
    <div className={`staff-board ${compact ? "compact" : ""}`} style={{ height }} aria-label={`Staff ${pitches.join(" ")}`}>
      <div className="staff-clef" style={{ top: padTop + extraTop + lineGap * 0.15, fontSize: compact ? 52 : 84 }}>
        𝄞
      </div>
      <div className="staff-canvas">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="staff-rule"
            style={{ top: padTop + extraTop + i * lineGap, left: padX - 12, right: 24 }}
          />
        ))}
        {steps.flatMap((step, i) =>
          ledgerSteps(step).map((ls) => (
            <div
              key={`${i}-${ls}`}
              className="staff-ledger"
              style={{
                top: padTop + extraTop + ls * (lineGap / 2),
                left: `calc(${46 + i * 9}% - ${noteW}px)`,
                width: noteW + 22,
              }}
            />
          )),
        )}
        {steps.map((step, i) => {
          const top = padTop + extraTop + step * (lineGap / 2) - noteH / 2;
          const left = `${46 + i * 9}%`;
          return (
            <div key={`${pitches[i]}-${i}`} className="staff-head-wrap" style={{ top, left }}>
              <div className="staff-head" style={{ width: noteW, height: noteH }} />
              <div className="staff-stem" style={{ height: compact ? 36 : 52, top: step >= 4 ? noteH / 2 - (compact ? 36 : 52) : noteH / 2 }} />
              {showNames && <span className="staff-name">{pitches[i]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

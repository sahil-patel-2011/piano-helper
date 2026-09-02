import type { Finger, FingerAdvice, HandSide } from "@piano-helper/shared";

const ORDER: Record<HandSide, Finger[]> = {
  lh: [5, 4, 3, 2, 1],
  rh: [1, 2, 3, 4, 5],
};

function FingerPip({
  n,
  active,
  home,
  hand,
}: {
  n: Finger;
  active: boolean;
  home: boolean;
  hand: HandSide;
}) {
  const thumb = n === 1;
  return (
    <div
      className={`finger-pip ${thumb ? "thumb" : ""} ${active ? "active" : ""} ${home ? "home" : ""} ${hand}`}
      title={`Finger ${n}`}
    >
      <span className="finger-bone" />
      <span className="finger-num">{n}</span>
    </div>
  );
}

export function HandCoach({ advice, fade }: { advice: FingerAdvice | null; fade?: boolean }) {
  const hand: HandSide = advice?.hand ?? "rh";
  const fingers = ORDER[hand];
  return (
    <div className={`hand-coach ${fade ? "faded" : ""}`}>
      <div className="muted hand-label">{hand === "rh" ? "Right hand" : "Left hand"}</div>
      <div className={`hand-shape ${hand}`}>
        {fingers.map((n) => (
          <FingerPip
            key={n}
            n={n}
            hand={hand}
            active={advice?.finger === n}
            home={Boolean(advice && advice.fromFinger === n && advice.finger !== n)}
          />
        ))}
      </div>
      <div className="hand-now">
        {advice ? (
          <>
            <strong>
              {advice.finger} · {advice.name}
            </strong>
            <span>{advice.pitch}</span>
          </>
        ) : (
          <span>Rest both hands on the keys</span>
        )}
      </div>
      {advice?.action === "stretch" && <div className="hand-tag">stretch</div>}
      {advice?.action === "thumb-under" && <div className="hand-tag">thumb under</div>}
      {advice?.action === "cross-over" && <div className="hand-tag">cross over</div>}
      {advice?.action === "shift" && <div className="hand-tag">shift the hand</div>}
    </div>
  );
}

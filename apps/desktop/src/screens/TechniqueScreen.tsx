import { useRef, useState } from "react";

export function TechniqueScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setOn(true);
    }
  }

  return (
    <div className="page">
      <div className="stack">
        <h1>Technique camera</h1>
        <p className="muted">
          Front camera with posture guides. This is a hint overlay — not a teacher. Sit tall, wrists level, forearms toward the fallboard.
        </p>
        <button className="primary" onClick={() => void start()}>
          Open camera
        </button>
        <div className="cam-frame">
          <video ref={videoRef} style={{ width: "100%", minHeight: 280, borderRadius: 8, background: "#000" }} />
          <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <line x1="50" y1="8" x2="50" y2="92" stroke="#e8c36a" strokeOpacity="0.55" />
            <ellipse cx="50" cy="22" rx="8" ry="10" fill="none" stroke="#e8c36a" strokeOpacity="0.45" />
            <rect x="28" y="58" width="44" height="10" fill="none" stroke="#e8c36a" strokeOpacity="0.8" />
            <text x="50" y="12" textAnchor="middle" fill="#e8c36a" fontSize="5">
              sit tall · wrists level
            </text>
            {!on && (
              <text x="50" y="48" textAnchor="middle" fill="#b4ae9f" fontSize="4.5">
                Open camera to see yourself in this frame
              </text>
            )}
          </svg>
        </div>
        <p className="muted">Pro-hand video overlays and extra profiles come later. Bluetooth MIDI uses the same MIDI picker in Settings.</p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { COPY, type Lesson } from "@piano-helper/shared";
import { getPiano, isStudio, studioImport, studioStatus } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

function fileToPayload(file: File): Promise<{ name: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const base64 = text.includes(",") ? text.slice(text.indexOf(",") + 1) : text;
      if (!base64) reject(new Error("That file was empty."));
      else resolve({ name: file.name || "score.jpg", base64 });
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Phone cameras shoot 12+ MP. The reader only needs ~2400px on the long side, and uploads 5x faster. */
async function shrinkPhoto(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return { blob: file, name: file.name || "score.jpg" };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4_000_000) return { blob: file, name: file.name || "score.jpg" };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return { blob: file, name: file.name || "score.jpg" };
    return { blob, name: (file.name || "score").replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name || "score.jpg" };
  }
}

export function ImportScreen() {
  const setLesson = useAppStore((s) => s.setLesson);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const studio = isStudio();
  const [readerLabel, setReaderLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!studio) return;
    void studioStatus()
      .then((st) => setReaderLabel(st.engines.find((e) => e.id === st.active)?.label ?? ""))
      .catch(() => setReaderLabel(""));
  }, [studio]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) void ingestFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function finish(lesson: Lesson, cached = false) {
    const api = getPiano();
    await api.saveLesson(lesson);
    useAppStore.getState().setLibrary(await api.listLibrary());
    const settings = useAppStore.getState().settings;
    const next = { ...settings, lastPieceId: lesson.id };
    useAppStore.getState().setSettings(next);
    void api.saveSettings(next);
    setLesson(lesson);
    const unsure = lesson.measures.flatMap((m) => m.events).filter((e) => e.uncertain).length;
    // Someone who doesn't read music can't fix notes in an editor; they can check by ear with "Hear it".
    if (unsure && !settings.simpleView) {
      showToast(`Imported ${lesson.title}. Check the notes marked unsure.`);
      setScreen("editor");
      return;
    }
    if (cached) {
      showToast(`Already read this photo, so it's using the saved notes for ${lesson.title}. No AI needed.`);
      useAppStore.getState().setMode("learn");
      setScreen("practice");
      return;
    }
    showToast(unsure ? `Ready: ${lesson.title}. ${unsure} note${unsure > 1 ? "s" : ""} the AI wasn't sure of — use Hear it if something sounds off.` : `Ready: ${lesson.title}`);
    useAppStore.getState().setMode("learn");
    setScreen("practice");
  }

  async function ingestFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
    setBusy(true);
    setStatus("Saving the page…");
    try {
      if (ext === "xml" || ext === "musicxml") {
        const text = await file.text();
        const { parseMusicXml } = await import("../../electron/musicxml");
        await finish(parseMusicXml(text, file.name));
        return;
      }
      if (studio) {
        const { blob, name } = await shrinkPhoto(file);
        const who = readerLabel || "The AI";
        setStatus(`${who} is reading the notes on your computer…`);
        const read = await studioImport(blob, name, (sec) =>
          setStatus(`${who} is reading the notes… ${sec}s (usually 30–90s)`),
        );
        await finish(read.lesson, read.cached);
        return;
      }
      const payload = await fileToPayload(file);
      const claude = await getPiano().claudeStatus();
      if (claude.cliLoggedIn) {
        try {
          setStatus("Claude is reading the notes…");
          const lesson = await getPiano().importBytes(payload);
          await finish(lesson);
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (!/oauth|login|authenticat|expired/i.test(msg)) throw e;
        }
      }
      setStatus("Sending this page to Claude Desktop…");
      const handoff = await getPiano().handoffImport(payload);
      setStatus(handoff.message);
      showToast(handoff.message);
    } catch (e) {
      showToast(e instanceof Error ? e.message : COPY.badJson);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function ingestPath(path: string) {
    setBusy(true);
    setStatus("Sending this page to Claude Desktop…");
    try {
      const claude = await getPiano().claudeStatus();
      if (claude.cliLoggedIn) {
        setStatus("Claude is reading the notes…");
        const lesson = await getPiano().runOmr(path);
        await finish(lesson);
        return;
      }
      const handoff = await getPiano().handoffPath(path);
      setStatus(handoff.message);
      showToast(handoff.message);
    } catch (e) {
      showToast(e instanceof Error ? e.message : COPY.badJson);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function startCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCamOn(true);
      }
    } catch {
      showToast(COPY.micDenied.replace("mic", "camera").replace("Microphone", "Camera"));
    }
  }

  async function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.92));
    if (!blob) return;
    await ingestFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
  }

  return (
    <div className="page">
      <div className="stack wide">
        <div className="page-head">
          <div>
            <h1>Import music</h1>
            <p className="muted">
              {studio
                ? `Snap a photo of the page. ${readerLabel || "Claude Code or Codex"} on your computer turns it into keys and finger numbers — on your subscription, no API credits.`
                : "Drop a photo of a page. Claude Desktop (the app you are signed into) reads the notes — no API credits."}
            </p>
            {studio && readerLabel === "" && (
              <p className="warn-line">No reader found on the studio computer. Install Claude Code or Codex there and sign in once.</p>
            )}
          </div>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void ingestFile(file);
          }}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf,.xml,.musicxml,application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void ingestFile(file);
          }}
        />
        <div
          className={`card drop-zone${dragOver ? " drop-hot" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void ingestFile(file);
          }}
          onClick={() => !busy && inputRef.current?.click()}
        >
          {preview ? <img src={preview} alt="Score preview" className="import-preview" /> : null}
          <div>
            <div className="serif" style={{ fontSize: "1.5rem" }}>
              {busy ? "Reading this page" : "Drop a score photo here"}
            </div>
            <p className="muted">
              {busy
                ? status
                : studio
                  ? "Or tap to choose · drop a file · paste · JPG, PNG, PDF, MusicXML"
                  : "Or click to choose a file · Ctrl+V to paste · PNG, JPG, WebP, PDF, MusicXML"}
            </p>
          </div>
        </div>
        {studio ? (
          <div className="row">
            <button className="primary big" disabled={busy} onClick={() => cameraRef.current?.click()}>
              Take photo
            </button>
            <button disabled={busy} onClick={() => inputRef.current?.click()}>
              Choose from photos
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              Choose photo
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                const path = await getPiano().pickImportFile();
                if (path) await ingestPath(path);
              }}
            >
              Browse disk
            </button>
            <button disabled={busy} onClick={() => void startCam()}>
              Open camera
            </button>
            <button className="primary" disabled={!camOn || busy} onClick={() => void snap()}>
              Snap page
            </button>
          </div>
        )}
        {studio && (
          <p className="muted">
            Tips: fill the frame with one or two lines of music, flat and well lit. Anything the reader is unsure of
            opens in the editor so you can fix it before practising.
          </p>
        )}
        {!studio && (
          <video
            ref={videoRef}
            style={{ width: "100%", maxWidth: 640, borderRadius: 8, background: "#000", minHeight: camOn ? 240 : 0 }}
          />
        )}
      </div>
    </div>
  );
}

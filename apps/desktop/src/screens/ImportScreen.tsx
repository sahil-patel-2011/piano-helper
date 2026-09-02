import { useEffect, useRef, useState } from "react";
import { COPY, lessonHasUncertain, type Lesson } from "@piano-helper/shared";
import { getPiano } from "../lib/piano-api";
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

export function ImportScreen() {
  const setLesson = useAppStore((s) => s.setLesson);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) void ingestFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function finish(lesson: Lesson) {
    await getPiano().saveLesson(lesson);
    setLesson(lesson);
    showToast(`Imported ${lesson.title}`);
    if (lessonHasUncertain(lesson)) setScreen("editor");
    else setScreen("practice");
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
              Drop a photo of a page. Claude Desktop (the app you are signed into) reads the notes — no API
              credits.
            </p>
          </div>
        </div>
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
                : "Or click to choose a file · Ctrl+V to paste · PNG, JPG, WebP, PDF, MusicXML"}
            </p>
          </div>
        </div>
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
        <video
          ref={videoRef}
          style={{ width: "100%", maxWidth: 640, borderRadius: 8, background: "#000", minHeight: camOn ? 240 : 0 }}
        />
      </div>
    </div>
  );
}

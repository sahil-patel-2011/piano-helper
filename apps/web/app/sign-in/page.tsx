"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setMsg("Auth is not configured. The desktop app works without an account.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : "Signed in. Open the dashboard.");
    if (!error) window.location.href = "/dashboard";
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p className="muted">Optional. Practice works offline with no account.</p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Sign in</button>
      </form>
      <p>
        <a href="/sign-up">Create an account</a>
      </p>
      {msg && <p className="muted">{msg}</p>}
    </main>
  );
}

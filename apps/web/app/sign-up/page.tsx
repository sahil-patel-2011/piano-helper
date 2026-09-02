"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setMsg("Auth is not configured yet. Download the app — it does not need this.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? error.message : "Check your email, then sign in.");
  }

  return (
    <main>
      <h1>Sign up</h1>
      <p className="muted">For the web dashboard only. API keys stay on your PC.</p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Create account</button>
      </form>
      <p>
        <a href="/sign-in">Already have an account</a>
      </p>
      {msg && <p className="muted">{msg}</p>}
    </main>
  );
}

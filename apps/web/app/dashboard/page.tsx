import { createClient } from "@/lib/supabase/server";

type SessionRow = {
  started_at: string;
  duration_sec: number;
  piece_title: string;
  accuracy: number;
  stars: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p className="muted">Open Piano Helper and enable Sync stats. This site has no database configured yet.</p>
      </main>
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p>
          <a href="/sign-in">Sign in</a> to see synced minutes.
        </p>
      </main>
    );
  }

  const { data } = await supabase
    .from("sessions")
    .select("started_at, duration_sec, piece_title, accuracy, stars")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as SessionRow[];
  const week = rows.reduce((n, r) => n + r.duration_sec, 0);

  return (
    <main>
      <h1>Dashboard</h1>
      {rows.length === 0 ? (
        <p className="muted">Open Piano Helper and enable Sync stats.</p>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <h3>This list</h3>
              <p>{Math.round(week / 60)} minutes</p>
            </div>
            <div className="card">
              <h3>Last piece</h3>
              <p>{rows[0]?.piece_title}</p>
            </div>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.started_at}>
                {r.piece_title} · {Math.round(r.duration_sec / 60)}m · {Math.round(r.accuracy * 100)}% · {r.stars}★
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

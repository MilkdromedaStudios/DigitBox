import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";
import { supabase } from "../../lib/supabaseClient";

export default function AdminAnalyticsPage() {
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(async ({ user, role }) => {
      if (!user || !isAdminRole(role)) return router.replace("/");
      setAllowed(true);
      if (!supabase) return;
      const { data, error: supaError } = await supabase
        .from("project_analytics")
        .select("project_slug, views, opens, updated_at")
        .order("views", { ascending: false })
        .limit(20);

      if (supaError) {
        setError("Analytics table not configured yet. Create table project_analytics and RPC track_project_view.");
        return;
      }
      setRows(data || []);
    });
  }, [router]);

  if (!allowed) return <div className="content">Checking admin access…</div>;

  const totalViews = rows.reduce((sum, item) => sum + (item.views || 0), 0);
  return (
    <div className="content">
      <h1>Task 2: Analytics</h1>
      <p className="post-meta">Professional-style dashboard starter using Supabase table data.</p>
      <Link className="like-btn action-btn" href="/admin">← Back to Admin Dashboard</Link>
      <div className="card-grid" style={{ marginTop: "1rem" }}>
        <article className="card"><h3>Total Views</h3><p>{totalViews}</p></article>
        <article className="card"><h3>Tracked Projects</h3><p>{rows.length}</p></article>
      </div>
      {error && <p className="post-meta">{error}</p>}
      <div className="admin-posts">
        {rows.map((item) => (
          <div key={item.project_slug} className="admin-post-row">
            <div>
              <strong>{item.project_slug}</strong>
              <div className="post-meta">Updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : "n/a"}</div>
            </div>
            <div className="post-meta">Views: {item.views || 0} · Opens: {item.opens || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";

const TASKS = [
  {
    title: "Task 1 · Project Management",
    description: "Upload, launch, and delete project builds with a clean operational workflow.",
    href: "/admin/projects",
    cta: "Manage Projects",
  },
  {
    title: "Task 2 · Analytics Dashboard",
    description: "Track project views, opens, and popularity rankings from Supabase analytics data.",
    href: "/admin/analytics",
    cta: "View Analytics",
  },
];

export default function AdminHomePage() {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(({ user, role }) => {
      if (!user || !isAdminRole(role)) return router.replace("/");
      setAllowed(true);
    });
  }, [router]);

  if (!allowed) return <div className="content">Checking admin access…</div>;

  return (
    <div className="content admin-shell">
      <section className="admin-hero">
        <h1>Admin Control Center</h1>
        <p className="post-meta">Professional dashboard with separated operational lanes for content and analytics.</p>
        <div className="gallery-actions">
          <Link className="auth-btn action-btn" href="/admin/projects">Projects</Link>
          <Link className="like-btn action-btn" href="/admin/analytics">Analytics</Link>
        </div>
      </section>

      <section className="admin-kpi-grid">
        <article className="admin-kpi-card"><h3>2</h3><p>Task Lanes</p></article>
        <article className="admin-kpi-card"><h3>100%</h3><p>Role-Gated Access</p></article>
        <article className="admin-kpi-card"><h3>Supabase</h3><p>Analytics Backend</p></article>
      </section>

      <section className="admin-task-grid">
        {TASKS.map((task) => (
          <article key={task.href} className="admin-task-card">
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            <Link className="auth-btn action-btn" href={task.href}>{task.cta}</Link>
          </article>
        ))}
      </section>

      <section className="admin-setup-card">
        <h3>Setup Instructions</h3>
        <p className="post-meta">Open <code>docs/SUPABASE_DASHBOARD_SETUP.md</code> and follow steps to configure table, RPC, and env vars.</p>
      </section>
    </div>
  );
}

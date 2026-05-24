import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";

const TASKS = [
  {
    title: "Task 1: Project Runtime + Management",
    description: "Run projects in fullscreen, track views, and manage project files (add/delete).",
    href: "/admin/projects",
    cta: "Open Projects",
  },
  {
    title: "Task 2: Analytics Dashboard",
    description: "See total views, click-throughs, and most popular projects with room for future insights.",
    href: "/admin/analytics",
    cta: "Open Analytics",
  },
];

export default function AdminHomePage() {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(({ user, role }) => {
      if (!user || !isAdminRole(role)) {
        router.replace("/");
        return;
      }
      setAllowed(true);
    });
  }, [router]);

  if (!allowed) return <div className="content">Checking admin access…</div>;

  return (
    <div className="content">
      <h1>Admin Dashboard</h1>
      <p className="post-meta">Choose a task lane below. This separates project management and analytics into two focused workflows.</p>
      <div className="card-grid" style={{ marginTop: "1rem" }}>
        {TASKS.map((task) => (
          <article key={task.href} className="card">
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            <Link className="auth-btn action-btn" href={task.href}>{task.cta}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

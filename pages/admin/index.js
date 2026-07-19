import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";

const DASHBOARD_CARDS = [
  { title: "Projects", description: "Publish, preview, and manage website projects.", href: "/admin/projects", cta: "Manage Projects" },
  { title: "Posts", description: "Create announcements and updates for visitors.", href: "/posts/new", cta: "Create Post" },
  { title: "Analytics", description: "Track what users view and what performs best.", href: "/admin/analytics", cta: "View Analytics" },
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
        <h1>Creator Dashboard</h1>
        <p className="post-meta">A cleaner control center for content, projects, and growth.</p>
      </section>
      <div className="card-grid">
        {DASHBOARD_CARDS.map((card) => (
          <article key={card.href} className="card">
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <Link className="auth-btn action-btn" href={card.href}>{card.cta}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { useRouter } from "next/router";

const TABS = [
  { href: "/octoloader", label: "Overview" },
  { href: "/octoloader/guide", label: "How to Use" },
  { href: "/octoloader/wiki", label: "Wiki" },
];

export default function OctoLoaderNav() {
  const router = useRouter();
  return (
    <nav className="octo-subnav" aria-label="Octo Loader section">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={router.pathname === tab.href ? "octo-tab octo-tab-active" : "octo-tab"}
        >
          {tab.label}
        </Link>
      ))}
      <a
        className="octo-tab"
        href="https://github.com/MilkdromedaStudios/DigitBox/actions/workflows/octo-loader.yml"
        target="_blank"
        rel="noreferrer"
      >
        Download ⬇
      </a>
      <a
        className="octo-tab"
        href="https://github.com/MilkdromedaStudios/DigitBox/tree/main/octo-loader"
        target="_blank"
        rel="noreferrer"
      >
        Source ↗
      </a>
    </nav>
  );
}

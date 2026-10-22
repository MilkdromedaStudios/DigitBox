import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

const STORAGE_KEY = "digitbox.tabSettings.v1";
const SETTINGS_EVENT = "digitbox:tab-settings-changed";

function readSettings() {
  if (typeof window === "undefined") return { title: "", icon: "" };
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      title: typeof data.title === "string" ? data.title.slice(0, 100) : "",
      icon: typeof data.icon === "string" ? data.icon : "",
    };
  } catch {
    return { title: "", icon: "" };
  }
}

// This runs from _app so preferences persist when Next.js updates <Head>
// or navigates into a full-screen game that does not show the normal header.
export function TabSettingsSync() {
  useEffect(() => {
    let saved = readSettings();
    let pageTitle = document.title;
    const originalIcon = document.head.querySelector('link[rel~="icon"]');
    const defaultHref = originalIcon?.getAttribute("href") || "/favicon.svg";
    const defaultType = originalIcon?.getAttribute("type");
    let addedIcon = null;

    function ensureIcon() {
      let link = document.head.querySelector('link[rel~="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
        addedIcon = link;
      }
      return link;
    }

    function applyIcon() {
      if (!saved.icon) return;
      const link = ensureIcon();
      if (link.getAttribute("href") !== saved.icon) link.setAttribute("href", saved.icon);
      // Let the browser recognize PNG/JPG/ICO as well as SVG favicons.
      if (link.hasAttribute("type")) link.removeAttribute("type");
    }

    function restoreIcon() {
      const link = document.head.querySelector('link[rel~="icon"]');
      if (link && link === addedIcon) {
        link.remove();
        addedIcon = null;
      } else if (link) {
        if (link.getAttribute("href") !== defaultHref) link.setAttribute("href", defaultHref);
        if (defaultType) {
          if (link.getAttribute("type") !== defaultType) link.setAttribute("type", defaultType);
        } else if (link.hasAttribute("type")) link.removeAttribute("type");
      }
    }

    const observer = new MutationObserver(() => {
      if (saved.title) {
        if (document.title !== saved.title) {
          pageTitle = document.title; // Next.js changed the underlying page title.
          document.title = saved.title;
        }
      } else {
        pageTitle = document.title;
      }
      applyIcon();
    });
    observer.observe(document.head, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["href", "type"],
    });

    if (saved.title) document.title = saved.title;
    applyIcon();

    function onChange() {
      saved = readSettings();
      document.title = saved.title || pageTitle;
      if (saved.icon) applyIcon();
      else restoreIcon();
    }
    window.addEventListener(SETTINGS_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      observer.disconnect();
      window.removeEventListener(SETTINGS_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return null;
}

export default function TabSettings() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [message, setMessage] = useState("");
  const root = useRef(null);

  useEffect(() => {
    const refresh = () => {
      const current = readSettings();
      setTitle(current.title);
      setIcon(current.icon);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function save(e) {
    e.preventDefault();
    const next = { title: title.trim(), icon: icon.trim() };
    if (next.icon) {
      try {
        const u = new URL(next.icon);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error("Invalid URL");
      } catch {
        setMessage("Enter a valid http:// or https:// image URL.");
        return;
      }
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SETTINGS_EVENT));
      setMessage("Saved! Your browser tab is customized.");
    } catch {
      setMessage("Your browser could not save these settings.");
    }
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(SETTINGS_EVENT));
      setTitle("");
      setIcon("");
      setMessage("DigitBox defaults restored.");
    } catch {
      setMessage("Could not reset browser storage.");
    }
  }

  return (
    <div className="db-tab-settings" ref={root}>
      <button
        className="db-tab-trigger"
        type="button"
        title="Customize browser tab"
        aria-label="Customize browser tab"
        aria-expanded={open}
        aria-controls="db-tab-panel"
        onClick={() => { setOpen(!open); setMessage(""); }}
      >
        <Icon name="settings" size={18} />
        <span>Tab Settings</span>
      </button>
      {open && (
        <form className="db-tab-panel" id="db-tab-panel" onSubmit={save} aria-label="Customize browser tab">
          <div className="db-tab-heading">
            <div>
              <h2>Customize Tab</h2>
              <p>Change how DigitBox appears in your browser.</p>
            </div>
            <button type="button" className="db-tab-close" onClick={() => setOpen(false)} aria-label="Close tab settings">
              <Icon name="close" size={18} />
            </button>
          </div>
          <label htmlFor="db-tab-name">Tab name</label>
          <input
            id="db-tab-name" maxLength={100} type="text" placeholder="DigitBox"
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
          <label htmlFor="db-tab-icon">Tab icon image URL</label>
          <input
            id="db-tab-icon" type="url" placeholder="https://example.com/icon.png"
            value={icon} onChange={(e) => setIcon(e.target.value)}
          />
          <p className="db-tab-hint">Use a direct PNG, JPG, ICO or SVG image link.</p>
          <div className="db-tab-actions">
            <button className="db-tab-reset" type="button" onClick={reset}>Reset</button>
            <button className="db-tab-save" type="submit">Save changes</button>
          </div>
          {message && <p className="db-tab-message" role="status">{message}</p>}
          <p className="db-tab-footnote">Saved in this browser only, not to your account.</p>
        </form>
      )}
    </div>
  );
}

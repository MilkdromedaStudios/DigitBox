import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { GameCard, GameCover } from "../../components/Cards";
import { SandboxedGame } from "../../components/HubProjectFrame";
import { getCloudAuthToken } from "../../lib/account";
import { toHubGame } from "../../lib/catalog";
import {
  EMOJI_SUGGESTIONS,
  MAX_DESCRIPTION_LENGTH,
  MAX_GENRE_LENGTH,
  MAX_HTML_BYTES,
  MAX_NAME_LENGTH,
  THEME_PRESETS,
  formatBytes,
  slugify,
  utf8Bytes,
  validateProjectFields,
} from "../../lib/projectRules";
import { refreshHubProjects } from "../../lib/useHubProjects";

// /admin/projects: add, edit, hide and delete the projects (cloud games)
// shown across DigitBox. Every change is checked on the server too
// (lib/serverAuth.js); this page only decides what to show.

async function adminApi(path, { method = "GET", json, body, headers } = {}) {
  const response = await fetch("/api/admin/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + getCloudAuthToken(),
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Something went wrong. Try again.");
    error.status = response.status;
    error.code = payload.code;
    error.fields = payload.fields || {};
    throw error;
  }
  return payload;
}

const EMPTY_FORM = { name: "", emoji: "🎮", hue: THEME_PRESETS[0].hue, description: "", genre: "", visible: true };

function formFrom(project) {
  return project
    ? { name: project.name, emoji: project.emoji, hue: project.hue, description: project.description, genre: project.genre, visible: project.visible }
    : EMPTY_FORM;
}

function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className={"admin-field" + (error ? " has-error" : "")}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="admin-field-error" role="alert">{error}</p> : hint ? <p className="admin-field-hint">{hint}</p> : null}
    </div>
  );
}

function ProjectEditor({ project, onDone, onCancel }) {
  const isNew = !project;
  const [form, setForm] = useState(() => formFrom(project));
  const [htmlMode, setHtmlMode] = useState(isNew ? "file" : "keep");
  const [htmlText, setHtmlText] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const set = (field) => (event) => {
    const value = event && event.target ? (event.target.type === "checkbox" ? event.target.checked : event.target.value) : event;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const slug = project ? project.slug : slugify(form.name);
  const previewGame = useMemo(
    () => toHubGame({ slug: slug || "new-project", name: form.name.trim() || "Project name", emoji: form.emoji || "🎮", hue: Number(form.hue), description: form.description, genre: form.genre }),
    [slug, form]
  );
  const replacingHtml = htmlMode === "file" || htmlMode === "paste";
  const htmlBytes = replacingHtml ? utf8Bytes(htmlText) : 0;

  async function onFile(event) {
    const file = event.target.files && event.target.files[0];
    setErrors((current) => ({ ...current, html: undefined }));
    if (!file) return;
    if (file.size > MAX_HTML_BYTES) {
      setHtmlText("");
      setFileName("");
      setErrors((current) => ({ ...current, html: `That file is ${formatBytes(file.size)}. The limit is 5 MB.` }));
      return;
    }
    setFileName(file.name);
    setHtmlText(await file.text());
  }

  async function showPreview() {
    setMessage("");
    if (replacingHtml) {
      if (!htmlText.trim()) {
        setErrors((current) => ({ ...current, html: "Add the game's HTML first." }));
        return;
      }
      setPreview(htmlText);
      return;
    }
    try {
      const response = await fetch("/api/admin/projects/" + encodeURIComponent(project.slug) + "/html", {
        headers: { Authorization: "Bearer " + getCloudAuthToken() },
      });
      if (!response.ok) throw new Error();
      setPreview(await response.text());
    } catch {
      setMessage("Couldn't load the current game to preview.");
    }
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    const checked = validateProjectFields({ ...form, hue: Number(form.hue) });
    const nextErrors = { ...(checked.errors || {}) };
    if (replacingHtml && !htmlText.trim()) nextErrors.html = isNew ? "Add the game's HTML." : "Add the new HTML, or keep the current game.";
    else if (replacingHtml && htmlBytes > MAX_HTML_BYTES) nextErrors.html = `The HTML is ${formatBytes(htmlBytes)}. The limit is 5 MB.`;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    let saved = project;
    try {
      saved = isNew
        ? (await adminApi("projects", { method: "POST", json: checked.value })).project
        : (await adminApi("projects/" + encodeURIComponent(project.slug), { method: "PATCH", json: checked.value })).project;
      if (replacingHtml) {
        saved = (
          await adminApi("projects/" + encodeURIComponent(saved.slug) + "/html", {
            method: "PUT",
            body: htmlText,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        ).project;
      }
      refreshHubProjects();
      onDone(saved, isNew ? "added" : "saved");
    } catch (error) {
      setErrors(error.fields || {});
      // A new project whose HTML failed to upload still exists: keep editing it.
      if (isNew && saved && saved.slug) {
        refreshHubProjects();
        onDone(saved, "html-failed", error.message);
        return;
      }
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-editor" onSubmit={save} noValidate>
      <div className="admin-editor-main">
        <Field label="Name" htmlFor="project-name" error={errors.name} hint={project ? "Its address stays /projects/" + project.slug : slug ? "Address: /projects/" + slug : ""}>
          <input id="project-name" className="admin-input" value={form.name} onChange={set("name")} maxLength={MAX_NAME_LENGTH} autoComplete="off" required />
        </Field>

        <Field label="Emoji" htmlFor="project-emoji" error={errors.emoji} hint="Type or paste any emoji, or pick one.">
          <div className="admin-emoji-row">
            <input id="project-emoji" className="admin-input admin-emoji-input" value={form.emoji} onChange={set("emoji")} maxLength={16} autoComplete="off" />
            <div className="admin-emoji-grid" role="group" aria-label="Suggested emoji">
              {EMOJI_SUGGESTIONS.map((emoji) => (
                <button key={emoji} type="button" className={"admin-emoji" + (form.emoji === emoji ? " is-active" : "")} aria-pressed={form.emoji === emoji} onClick={() => set("emoji")(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Colour theme" htmlFor="project-hue" error={errors.hue}>
          <div className="admin-themes" role="group" aria-label="Colour themes">
            {THEME_PRESETS.map((theme) => (
              <button
                key={theme.name}
                type="button"
                className={"admin-theme" + (Number(form.hue) === theme.hue ? " is-active" : "")}
                style={{ "--h": theme.hue }}
                aria-pressed={Number(form.hue) === theme.hue}
                onClick={() => set("hue")(theme.hue)}
              >
                <span className="admin-theme-swatch" aria-hidden="true" />
                {theme.name}
              </button>
            ))}
          </div>
          <input id="project-hue" className="admin-hue" type="range" min="0" max="359" value={form.hue} onChange={(event) => set("hue")(Number(event.target.value))} aria-label="Custom colour" />
        </Field>

        <Field label="Description (optional)" htmlFor="project-description" error={errors.description} hint="Shown on the game's card in lists and search.">
          <textarea id="project-description" className="admin-input" rows={2} value={form.description} onChange={set("description")} maxLength={MAX_DESCRIPTION_LENGTH} />
        </Field>

        <Field label="Genre (optional)" htmlFor="project-genre" error={errors.genre} hint="For example Racing or Puzzle. It also becomes a filter on the Games page.">
          <input id="project-genre" className="admin-input" value={form.genre} onChange={set("genre")} maxLength={MAX_GENRE_LENGTH} autoComplete="off" />
        </Field>

        <Field label="Game HTML" htmlFor="project-html" error={errors.html} hint="One self-contained .html file, up to 5 MB. Its images, sounds and scripts must be inside the file or loaded from full https:// links.">
          <div className="admin-html-modes" role="group" aria-label="How to add the HTML">
            {!isNew && (
              <button type="button" className={"hub-chip" + (htmlMode === "keep" ? " is-active" : "")} aria-pressed={htmlMode === "keep"} onClick={() => setHtmlMode("keep")}>
                Keep current game
              </button>
            )}
            <button type="button" className={"hub-chip" + (htmlMode === "file" ? " is-active" : "")} aria-pressed={htmlMode === "file"} onClick={() => setHtmlMode("file")}>
              Upload a file
            </button>
            <button type="button" className={"hub-chip" + (htmlMode === "paste" ? " is-active" : "")} aria-pressed={htmlMode === "paste"} onClick={() => setHtmlMode("paste")}>
              Paste HTML
            </button>
          </div>
          {htmlMode === "keep" && <p className="admin-field-hint">{project.htmlBytes ? "Current game: " + formatBytes(project.htmlBytes) : "This project has no game yet. Upload or paste one."}</p>}
          {htmlMode === "file" && (
            <label className="admin-file">
              <input id="project-html" type="file" accept=".html,.htm,text/html" onChange={onFile} />
              <Icon name="upload" size={18} />
              <span>{fileName ? fileName + " · " + formatBytes(htmlBytes) : "Choose an .html file"}</span>
            </label>
          )}
          {htmlMode === "paste" && (
            <textarea
              id="project-html"
              className="admin-input admin-code"
              rows={10}
              spellCheck={false}
              placeholder="<!DOCTYPE html>..."
              value={htmlText}
              onChange={(event) => {
                setHtmlText(event.target.value);
                setErrors((current) => ({ ...current, html: undefined }));
              }}
            />
          )}
        </Field>

        <label className="admin-check">
          <input type="checkbox" checked={form.visible} onChange={set("visible")} />
          <span>Show on the site</span>
        </label>

        {message && <p className="admin-message is-error" role="alert">{message}</p>}

        <div className="admin-actions">
          <button type="submit" className="hub-pill-btn is-primary" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add project" : "Save changes"}
          </button>
          <button type="button" className="hub-pill-btn" onClick={showPreview} disabled={saving}>
            <Icon name="play" size={16} />Test the game
          </button>
          <button type="button" className="hub-pill-btn" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </div>

      <aside className="admin-editor-side" aria-label="Preview">
        <span className="hub-kicker">PREVIEW</span>
        <div className="admin-card-preview">
          <GameCard game={{ ...previewGame, href: "#" }} />
        </div>
      </aside>

      {preview !== null && (
        <div className="admin-preview" role="dialog" aria-label="Game preview">
          <div className="admin-preview-bar">
            <strong>{previewGame.icon} {previewGame.title}</strong>
            <span>Preview · progress isn&apos;t saved</span>
            <button type="button" className="hub-pill-btn" onClick={() => setPreview(null)}>Close</button>
          </div>
          <div className="admin-preview-frame">
            <SandboxedGame html={preview} slug={slug || "preview"} title={previewGame.title} />
          </div>
        </div>
      )}
    </form>
  );
}

function ProjectRow({ project, busy, onEdit, onToggle, onDelete }) {
  const game = toHubGame(project);
  const playable = project.visible && project.htmlBytes > 0;
  return (
    <li className="admin-project">
      <span className="admin-project-cover"><GameCover game={game} size="sm" /></span>
      <span className="admin-project-text">
        <strong>{project.name}</strong>
        <span className="admin-project-meta">
          <span className={"admin-badge" + (playable ? " is-live" : "")}>{!project.htmlBytes ? "No game yet" : project.visible ? "Shown" : "Hidden"}</span>
          {project.htmlBytes > 0 && <span>{formatBytes(project.htmlBytes)}</span>}
          <span>/projects/{project.slug}</span>
        </span>
      </span>
      <span className="admin-project-actions">
        {playable && <Link className="hub-pill-btn" href={game.href}>Play</Link>}
        <button type="button" className="hub-pill-btn" onClick={onEdit} disabled={busy}>Edit</button>
        <button type="button" className="hub-pill-btn" onClick={onToggle} disabled={busy} aria-pressed={project.visible}>
          {project.visible ? "Hide" : "Show"}
        </button>
        <button type="button" className="hub-pill-btn is-danger" onClick={onDelete} disabled={busy}>Delete</button>
      </span>
    </li>
  );
}

export default function AdminProjectsPage() {
  const [phase, setPhase] = useState("checking");
  const [projects, setProjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busySlug, setBusySlug] = useState("");
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const { projects: list } = await adminApi("projects");
      setProjects(list || []);
      setPhase("ready");
    } catch (error) {
      setPhase(error.code || (error.status === 401 ? "signed_out" : error.status === 403 ? "not_admin" : "error"));
    }
  }, []);

  useEffect(() => {
    if (!getCloudAuthToken()) setPhase("signed_out");
    else load();
  }, [load]);

  function finishEditing(project, outcome, detail) {
    if (outcome === "html-failed") {
      setNotice({ tone: "error", text: `${project.name} was added, but its HTML didn't upload: ${detail} Open Edit to try the upload again.` });
    } else {
      setNotice({ tone: "ok", text: outcome === "added" ? `Added ${project.name}.` : `Saved ${project.name}.` });
    }
    setEditing(null);
    load();
  }

  async function toggle(project) {
    setBusySlug(project.slug);
    try {
      await adminApi("projects/" + encodeURIComponent(project.slug), { method: "PATCH", json: { visible: !project.visible } });
      refreshHubProjects();
      setNotice({ tone: "ok", text: project.visible ? `${project.name} is hidden.` : `${project.name} is shown on the site.` });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error.message });
    } finally {
      setBusySlug("");
    }
  }

  async function remove(project) {
    if (!window.confirm(`Delete ${project.name}? Its game is removed from DigitBox for everyone. This can't be undone.`)) return;
    setBusySlug(project.slug);
    try {
      await adminApi("projects/" + encodeURIComponent(project.slug), { method: "DELETE" });
      refreshHubProjects();
      setNotice({ tone: "ok", text: `Deleted ${project.name}.` });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error.message });
    } finally {
      setBusySlug("");
    }
  }

  const gate = {
    checking: { title: "Checking admin access…" },
    signed_out: { title: "Sign in to manage projects", body: "Use the DigitBox account that owns this site.", link: { href: "/login?next=/admin/projects", label: "Sign in" } },
    not_admin: { title: "This account isn't an admin", body: "Only the site owner (and accounts listed in ADMIN_EMAILS) can manage projects." },
    no_storage: { title: "Project storage isn't available here", body: "Projects are stored in the site's Cloudflare D1 database. Manage them on digitbox.dev." },
    error: { title: "Couldn't load projects", body: "Check your connection and try again.", retry: true },
  }[phase];

  return (
    <>
      <Head>
        <title>Projects - DigitBox Admin</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="hub-page admin-page">
        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">ADMIN</span>
            <h1>Projects</h1>
            <p>Add games to DigitBox: give each one a name, an emoji, a colour theme and its HTML. They show up on the home page, the Games page and in search as soon as you save.</p>
          </div>
          {phase === "ready" && !editing && (
            <button type="button" className="hub-pill-btn is-primary" onClick={() => { setNotice(null); setEditing({ project: null }); }}>
              <Icon name="plus" size={18} />New project
            </button>
          )}
        </div>

        {gate ? (
          <div className="hub-empty" aria-live="polite">
            <Icon name="settings" />
            <h3>{gate.title}</h3>
            {gate.body && <p>{gate.body}</p>}
            {gate.link && <Link href={gate.link.href} className="hub-pill-btn is-primary">{gate.link.label}</Link>}
            {gate.retry && <button type="button" className="hub-pill-btn" onClick={() => { setPhase("checking"); load(); }}>Try again</button>}
          </div>
        ) : (
          <>
            {notice && <p className={"admin-message " + (notice.tone === "ok" ? "is-ok" : "is-error")} role="status">{notice.text}</p>}

            {editing ? (
              <section className="hub-shelf" aria-label={editing.project ? "Edit project" : "New project"}>
                <div className="hub-shelf-head"><h2><Icon name="games" />{editing.project ? "Edit " + editing.project.name : "New project"}</h2></div>
                <ProjectEditor key={editing.project ? editing.project.slug : "new"} project={editing.project} onDone={finishEditing} onCancel={() => setEditing(null)} />
              </section>
            ) : projects.length ? (
              <ul className="admin-projects">
                {projects.map((project) => (
                  <ProjectRow
                    key={project.slug}
                    project={project}
                    busy={busySlug === project.slug}
                    onEdit={() => { setNotice(null); setEditing({ project }); }}
                    onToggle={() => toggle(project)}
                    onDelete={() => remove(project)}
                  />
                ))}
              </ul>
            ) : (
              <div className="hub-empty">
                <Icon name="games" />
                <h3>No projects yet</h3>
                <p>Add your first game and it will appear across DigitBox.</p>
                <button type="button" className="hub-pill-btn is-primary" onClick={() => setEditing({ project: null })}>New project</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

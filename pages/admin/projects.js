import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { GameCard, GameCover } from "../../components/Cards";
import { SandboxedGame, fetchProjectHtml } from "../../components/HubProjectFrame";
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
  projectSlug,
  splitText,
  utf8Bytes,
  validateProjectFields,
} from "../../lib/projectRules";
import { refreshHubProjects } from "../../lib/useHubProjects";

// /admin/projects: add, edit, hide and delete the projects (cloud games)
// shown across DigitBox, both the ones added here and the built-in ones.
// Every change is checked on the server too (lib/serverAuth.js); this page
// only decides what to show.

function authHeaders(extra) {
  return { Authorization: "Bearer " + getCloudAuthToken(), ...extra };
}

async function adminApi(path, { method = "GET", json, body, headers } = {}) {
  const response = await fetch("/api/admin/" + path, {
    method,
    headers: authHeaders({ ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }),
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Something went wrong. Try again.");
    error.status = response.status;
    error.code = payload.code;
    error.userId = payload.userId;
    error.fields = payload.fields || {};
    throw error;
  }
  return payload;
}

function randomUploadId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Upload HTML piece by piece (see lib/hubProjects.js); the last piece swaps
// it in. Each piece is retried once if the connection drops.
async function uploadHtml(slug, html, onProgress) {
  const parts = splitText(html);
  const upload = randomUploadId();
  let project = null;
  for (let part = 0; part < parts.length; part += 1) {
    onProgress(part, parts.length);
    const path = "projects/" + encodeURIComponent(slug) + "/html?upload=" + upload + "&part=" + part + "&parts=" + parts.length;
    const send = () => adminApi(path, { method: "PUT", body: parts[part], headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const result = await send().catch((error) => (error.status ? Promise.reject(error) : send()));
    if (result.project) project = result.project;
  }
  return project;
}

function loadCurrentHtml(slug, parts) {
  return fetchProjectHtml("/api/admin/projects/" + encodeURIComponent(slug) + "/html", parts, "", { headers: authHeaders() });
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

// Editor for an added project (`project`, or a new one when null) or a
// built-in game (`builtIn`), which keeps its own files: no HTML section.
function ProjectEditor({ project, builtIn, onDone, onCancel }) {
  const item = project || builtIn;
  const isNew = !item;
  const [form, setForm] = useState(() => formFrom(item));
  const [htmlMode, setHtmlMode] = useState(isNew ? "file" : "keep");
  const [htmlText, setHtmlText] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState("");
  const [preview, setPreview] = useState(null);

  const set = (field) => (event) => {
    const value = event && event.target ? (event.target.type === "checkbox" ? event.target.checked : event.target.value) : event;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const slug = item ? item.slug : projectSlug(form.name);
  const previewGame = useMemo(
    () => toHubGame({ slug: slug || "new-project", name: form.name.trim() || "Project name", emoji: form.emoji || "🎮", hue: Number(form.hue), description: form.description, genre: form.genre }),
    [slug, form]
  );
  const replacingHtml = !builtIn && (htmlMode === "file" || htmlMode === "paste");
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
    if (builtIn) {
      window.open(builtIn.href, "_blank", "noopener");
      return;
    }
    if (replacingHtml) {
      if (!htmlText.trim()) {
        setErrors((current) => ({ ...current, html: "Add the game's HTML first." }));
        return;
      }
      setPreview(htmlText);
      return;
    }
    try {
      setPreview(await loadCurrentHtml(project.slug, project.htmlParts));
    } catch {
      setMessage("Couldn't load the current game to preview.");
    }
  }

  async function saveBuiltIn(fields) {
    const { change } = await adminApi("builtins/" + encodeURIComponent(builtIn.slug), { method: "PATCH", json: fields });
    refreshHubProjects();
    onDone({ ...builtIn, name: fields.name || builtIn.name }, change === null ? "reset" : "saved");
  }

  async function resetBuiltIn() {
    if (!window.confirm(`Undo every change to ${builtIn.original.name}? Its name, emoji, colour, description and genre go back to the originals, and it's shown again.`)) return;
    setSaving("Resetting…");
    try {
      await saveBuiltIn({ reset: true });
    } catch (error) {
      setMessage(error.message);
      setSaving("");
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

    setSaving("Saving…");
    if (builtIn) {
      try {
        await saveBuiltIn(checked.value);
      } catch (error) {
        setErrors(error.fields || {});
        setMessage(error.message);
        setSaving("");
      }
      return;
    }

    let saved = null;
    try {
      saved = isNew
        ? (await adminApi("projects", { method: "POST", json: checked.value })).project
        : (await adminApi("projects/" + encodeURIComponent(project.slug), { method: "PATCH", json: checked.value })).project;
      if (replacingHtml) {
        saved = await uploadHtml(saved.slug, htmlText, (part, parts) => setSaving(parts > 1 ? `Uploading ${part + 1} of ${parts}…` : "Uploading…"));
      }
      refreshHubProjects();
      onDone(saved, isNew ? "added" : "saved");
    } catch (error) {
      if (saved) {
        // The details were saved; only the HTML upload failed.
        refreshHubProjects();
        onDone(saved, "html-failed", error.message);
        return;
      }
      setErrors(error.fields || {});
      setMessage(error.message);
      setSaving("");
    }
  }

  return (
    <form className="admin-editor" onSubmit={save} noValidate>
      <div className="admin-editor-main">
        {builtIn && (
          <p className="admin-message">
            A built-in game: you can change how it&apos;s shown here. Its game files stay as they are; to swap the game itself, delete this one and add a new project.
          </p>
        )}

        <Field label="Name" htmlFor="project-name" error={errors.name} hint={item ? "Its address stays " + (builtIn ? builtIn.href : "/projects/" + item.slug) : "Address: /projects/" + slug}>
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

        {!builtIn && (
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
        )}

        <label className="admin-check">
          <input type="checkbox" checked={form.visible} onChange={set("visible")} />
          <span>Show on the site</span>
        </label>

        {message && <p className="admin-message is-error" role="alert">{message}</p>}

        <div className="admin-actions">
          <button type="submit" className="hub-pill-btn is-primary" disabled={Boolean(saving)}>
            {saving || (isNew ? "Add project" : "Save changes")}
          </button>
          <button type="button" className="hub-pill-btn" onClick={showPreview} disabled={Boolean(saving)}>
            <Icon name="play" size={16} />{builtIn ? "Open the game" : "Test the game"}
          </button>
          {builtIn && builtIn.edited && (
            <button type="button" className="hub-pill-btn" onClick={resetBuiltIn} disabled={Boolean(saving)}>Reset to original</button>
          )}
          <button type="button" className="hub-pill-btn" onClick={onCancel} disabled={Boolean(saving)}>Cancel</button>
        </div>
      </div>

      <aside className="admin-editor-side" aria-label="Preview">
        <span className="hub-kicker">PREVIEW</span>
        <div className="admin-card-preview">
          <GameCard game={{ ...previewGame, href: "#", studio: builtIn ? "DigitBox Cloud" : previewGame.studio }} />
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

function StateBadge({ live, children }) {
  return <span className={"admin-state" + (live ? " is-live" : "")}>{children}</span>;
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
          <StateBadge live={playable}>{!project.htmlBytes ? "No game yet" : project.visible ? "Shown" : "Hidden"}</StateBadge>
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

function BuiltInRow({ game, busy, onEdit, onToggle, onDelete, onRestore }) {
  const cover = { title: game.name, icon: game.emoji, hue: game.hue };
  const live = game.visible && !game.deleted;
  return (
    <li className={"admin-project" + (game.deleted ? " is-deleted" : "")}>
      <span className="admin-project-cover"><GameCover game={cover} size="sm" /></span>
      <span className="admin-project-text">
        <strong>{game.name}</strong>
        <span className="admin-project-meta">
          <StateBadge live={live}>{game.deleted ? "Deleted" : game.visible ? "Shown" : "Hidden"}</StateBadge>
          {game.edited && <span>Edited</span>}
          <span>{game.href}</span>
        </span>
      </span>
      <span className="admin-project-actions">
        {game.deleted ? (
          <button type="button" className="hub-pill-btn" onClick={onRestore} disabled={busy}>Restore</button>
        ) : (
          <>
            {live && <Link className="hub-pill-btn" href={game.href}>Play</Link>}
            <button type="button" className="hub-pill-btn" onClick={onEdit} disabled={busy}>Edit</button>
            <button type="button" className="hub-pill-btn" onClick={onToggle} disabled={busy} aria-pressed={game.visible}>
              {game.visible ? "Hide" : "Show"}
            </button>
            <button type="button" className="hub-pill-btn is-danger" onClick={onDelete} disabled={busy}>Delete</button>
          </>
        )}
      </span>
    </li>
  );
}

export default function AdminProjectsPage() {
  const [phase, setPhase] = useState("checking");
  const [projects, setProjects] = useState([]);
  const [builtIns, setBuiltIns] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busySlug, setBusySlug] = useState("");
  const [notice, setNotice] = useState(null);
  const [userId, setUserId] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await adminApi("projects");
      setProjects(payload.projects || []);
      setBuiltIns(payload.builtIns || []);
      setPhase("ready");
    } catch (error) {
      setUserId(error.userId || "");
      setPhase(error.code || (error.status === 401 ? "signed_out" : error.status === 403 ? "not_admin" : "error"));
    }
  }, []);

  useEffect(() => {
    if (!getCloudAuthToken()) setPhase("signed_out");
    else load();
  }, [load]);

  function finishEditing(item, outcome, detail) {
    const name = item.name;
    const text = {
      added: `Added ${name}.`,
      saved: `Saved ${name}.`,
      reset: `${name} is back to how it shipped.`,
      "html-failed": `Saved ${name}'s details, but its HTML didn't upload: ${detail} Open Edit to try the upload again.`,
    }[outcome];
    setNotice({ tone: outcome === "html-failed" ? "error" : "ok", text });
    setEditing(null);
    load();
  }

  // Run a change, then refresh this list and every list on the site.
  async function change(slug, run, done) {
    setBusySlug(slug);
    try {
      await run();
      refreshHubProjects();
      setNotice({ tone: "ok", text: done });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error.message });
    } finally {
      setBusySlug("");
    }
  }

  const projectPath = (project) => "projects/" + encodeURIComponent(project.slug);
  const builtInPath = (game) => "builtins/" + encodeURIComponent(game.slug);

  function removeProject(project) {
    if (!window.confirm(`Delete ${project.name}? Its game is removed from DigitBox for everyone. This can't be undone.`)) return;
    change(project.slug, () => adminApi(projectPath(project), { method: "DELETE" }), `Deleted ${project.name}.`);
  }

  function removeBuiltIn(game) {
    const message = `Delete ${game.name} from DigitBox?\n\nIt disappears from every list, and its page and game files stop loading for everyone. You can restore it from this page later.`;
    if (!window.confirm(message)) return;
    change(game.slug, () => adminApi(builtInPath(game), { method: "DELETE" }), `Deleted ${game.name}. Its page and files no longer load.`);
  }

  const gate = {
    checking: { title: "Checking admin access…" },
    signed_out: { title: "Sign in to manage projects", body: "Use the DigitBox account that owns this site.", link: { href: "/login?next=/admin/projects", label: "Sign in" } },
    not_admin: {
      title: "This account isn't an admin",
      body: "Only the site owner can manage projects. To make this account an admin too, add its ID to ADMIN_USER_IDS in the site's settings.",
      id: userId,
    },
    no_storage: { title: "Project storage isn't available here", body: "Projects are stored in the site's Cloudflare D1 database. Manage them on digitbox.dev." },
    error: { title: "Couldn't load projects", body: "Check your connection and try again.", retry: true },
  }[phase];

  const shownBuiltIns = [...builtIns].sort((a, b) => Number(a.deleted) - Number(b.deleted));

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
            <p>Add games to DigitBox, and edit, hide or delete any game on the site. Changes show up on the home page, the Games page and in search as soon as you save.</p>
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
            {gate.id && <p className="admin-user-id">Account ID: <code>{gate.id}</code></p>}
            {gate.link && <Link href={gate.link.href} className="hub-pill-btn is-primary">{gate.link.label}</Link>}
            {gate.retry && <button type="button" className="hub-pill-btn" onClick={() => { setPhase("checking"); load(); }}>Try again</button>}
          </div>
        ) : editing ? (
          <section className="hub-shelf" aria-label={editing.project || editing.builtIn ? "Edit project" : "New project"}>
            <div className="hub-shelf-head">
              <h2><Icon name="games" />{editing.builtIn ? "Edit " + editing.builtIn.name : editing.project ? "Edit " + editing.project.name : "New project"}</h2>
            </div>
            <ProjectEditor
              key={editing.builtIn ? "builtin:" + editing.builtIn.slug : editing.project ? editing.project.slug : "new"}
              project={editing.project}
              builtIn={editing.builtIn}
              onDone={finishEditing}
              onCancel={() => { setEditing(null); load(); }}
            />
          </section>
        ) : (
          <>
            {notice && <p className={"admin-message " + (notice.tone === "ok" ? "is-ok" : "is-error")} role="status">{notice.text}</p>}

            <section className="hub-shelf" aria-label="Your projects">
              <div className="hub-shelf-head"><h2><Icon name="plus" />Added projects</h2></div>
              {projects.length ? (
                <ul className="admin-projects">
                  {projects.map((project) => (
                    <ProjectRow
                      key={project.slug}
                      project={project}
                      busy={busySlug === project.slug}
                      onEdit={() => { setNotice(null); setEditing({ project }); }}
                      onToggle={() => change(project.slug, () => adminApi(projectPath(project), { method: "PATCH", json: { visible: !project.visible } }), project.visible ? `${project.name} is hidden.` : `${project.name} is shown on the site.`)}
                      onDelete={() => removeProject(project)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="hub-empty">
                  <Icon name="games" />
                  <h3>No projects added yet</h3>
                  <p>Add a game with a name, an emoji, a colour and its HTML, and it appears across DigitBox.</p>
                  <button type="button" className="hub-pill-btn is-primary" onClick={() => setEditing({ project: null })}>New project</button>
                </div>
              )}
            </section>

            <section className="hub-shelf" aria-label="Built-in games">
              <div className="hub-shelf-head">
                <div>
                  <h2><Icon name="games" />Built-in games</h2>
                  <p className="hub-shelf-sub">The games DigitBox ships with. Deleting one takes it down everywhere at once; its original file stays in the GitHub repository until it&apos;s removed there.</p>
                </div>
              </div>
              <ul className="admin-projects">
                {shownBuiltIns.map((game) => (
                  <BuiltInRow
                    key={game.slug}
                    game={game}
                    busy={busySlug === game.slug}
                    onEdit={() => { setNotice(null); setEditing({ builtIn: game }); }}
                    onToggle={() => change(game.slug, () => adminApi(builtInPath(game), { method: "PATCH", json: { visible: !game.visible } }), game.visible ? `${game.name} is hidden.` : `${game.name} is shown on the site.`)}
                    onDelete={() => removeBuiltIn(game)}
                    onRestore={() => change(game.slug, () => adminApi(builtInPath(game), { method: "PATCH", json: { deleted: false } }), `Restored ${game.name}.`)}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}

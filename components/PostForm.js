import { useMemo, useState } from "react";
import { fetchWithRetry, toFriendlyNetworkError } from "../lib/fetchWithRetry";

function markdownToHtml(md) {
  return md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
    .replace(/\n$/gim, "<br />");
}

export default function PostForm({ className = "post-form" }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const preview = useMemo(() => markdownToHtml(content), [content]);

  async function createPost(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setStatus({ type: "error", message: "Title and content are required." });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>${title}</title></head><body><article>${preview}</article></body></html>`;
      const res = await fetch("/api/content/publish", {
      const res = await fetchWithRetry("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "post", title, html, markdown: content }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to publish post");

      setTitle("");
      setContent("");
      setStatus({ type: "success", message: `Post published to ${payload.htmlPath}` });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to create post." });
      setStatus({ type: "error", message: toFriendlyNetworkError(error) || "Failed to create post." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={className} onSubmit={createPost}>
      <input className="auth-input" placeholder="Post title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="auth-input" placeholder="Write Markdown..." value={content} onChange={(e) => setContent(e.target.value)} rows={10} />
      <div className="post-body" dangerouslySetInnerHTML={{ __html: preview }} />
      <button className="auth-btn" type="submit" disabled={loading}>{loading ? "Publishing..." : "Publish Post"}</button>
      {status.message && <p className="post-meta" style={{ color: status.type === "error" ? "#ffb3b3" : "#9effb1" }}>{status.message}</p>}
    </form>
  );
}

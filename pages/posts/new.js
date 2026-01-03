// digitbox/pages/posts/new.js
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../../styles/Posts.module.css";

export default function NewPost() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
      setLoadingUser(false);
    });
  }, []);

  const isAdmin = user?.email === "wong.christopher501@gmail.com";

  if (loadingUser) return <p className={styles.centerText}>Loading...</p>;

  if (!isAdmin) {
    return (
      <div className={styles.centerText}>
        <h1>Access Denied</h1>
        <p>You do not have permission to create posts.</p>
      </div>
    );
  }

  function handleFakeSubmit(e) {
    e.preventDefault();
    setMessage(
      "Post editor UI ready. Next step: wire this to Supabase and a markdown/BBCode/LaTeX renderer."
    );
  }

  return (
    <div className={styles.container}>
      <h1>New Post</h1>

      <form className={styles.editorForm} onSubmit={handleFakeSubmit}>
        <input
          type="text"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={styles.editorTitle}
        />

        <textarea
          placeholder="Write your post here (Markdown, BBCode, LaTeX)..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className={styles.editorTextarea}
        />

        <button type="submit" className={styles.editorSubmit}>
          Save post (not wired yet)
        </button>
      </form>

      {message && <p className={styles.editorMessage}>{message}</p>}

      <div className={styles.previewBox}>
        <h2>Live Preview (raw)</h2>
        <pre>{content}</pre>
      </div>
    </div>
  );
}

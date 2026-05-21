import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function PostForm({ authorEmail, onCreated, className = "post-form" }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  async function createPost(e) {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      setStatus({ type: "error", message: "Title and content are required." });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      let image_url = null;

      if (imageFile) {
        const ext = imageFile.name.includes(".")
          ? imageFile.name.split(".").pop()
          : "bin";
        const fileName = `${crypto.randomUUID()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(fileName, imageFile);

        if (uploadError || !uploadData?.path) {
          throw new Error(uploadError?.message || "Image upload failed.");
        }

        const { data: publicUrlData } = supabase.storage
          .from("post-images")
          .getPublicUrl(uploadData.path);

        image_url = publicUrlData?.publicUrl || null;
      }

      const { error: insertError } = await supabase.from("posts").insert({
        title: title.trim(),
        content: content.trim(),
        image_url,
        author: authorEmail,
      });

      if (insertError) {
        throw new Error(insertError.message || "Failed to create post.");
      }

      setTitle("");
      setContent("");
      setImageFile(null);
      setStatus({ type: "success", message: "Post created successfully." });
      onCreated?.();
    } catch (error) {
      setStatus({
        type: "error",
        message: error?.message || "Failed to create post.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={className} onSubmit={createPost}>
      <input
        className="auth-input"
        placeholder="Post title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="auth-input"
        placeholder="Write your post (Markdown allowed)..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
      />
      <button className="auth-btn" type="submit" disabled={loading}>
        {loading ? "Posting..." : "Create Post"}
      </button>

      {status.message && (
        <p
          className="post-meta"
          style={{ color: status.type === "error" ? "#ffb3b3" : "#9effb1" }}
        >
          {status.message}
        </p>
      )}
    </form>
  );
}

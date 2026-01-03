// digitbox/pages/admin/gallery.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const adminEmails = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export default function AdminGalleryPage() {
  const [user, setUser] = useState(null);
  const [title, setTitle] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);
      if (!u || !adminEmails.includes(u.email)) {
        router.replace("/");
      }
    });
    loadImages();
  }, []);

  async function loadImages() {
    const { data, error } = await supabase
      .from("gallery_images")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setItems(data || []);
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!title || !imageFile) return;
    if (!user || !adminEmails.includes(user.email)) return;

    setLoading(true);

    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from("gallery-images")
      .upload(fileName, imageFile);

    if (storageError) {
      setLoading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage
      .from("gallery-images")
      .getPublicUrl(storageData.path);

    await supabase.from("gallery_images").insert({
      title,
      image_url: publicUrl.publicUrl,
      author: user.email,
    });

    setTitle("");
    setImageFile(null);
    setLoading(false);
    loadImages();
  }

  async function deleteImage(id) {
    await supabase.from("gallery_images").delete().eq("id", id);
    loadImages();
  }

  if (!user || !adminEmails.includes(user.email)) {
    return <div className="content">Checking admin access…</div>;
  }

  return (
    <div className="content">
      <h1>Admin Gallery</h1>
      <p className="admin-subtitle">Upload images to the gallery</p>

      <form className="post-form" onSubmit={handleUpload}>
        <input
          className="auth-input"
          placeholder="Image title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files[0] || null)}
        />
        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Uploading..." : "Upload Image"}
        </button>
      </form>

      <div className="admin-posts">
        {items.map((item) => (
          <div key={item.id} className="admin-post-row">
            <div>
              <strong>{item.title}</strong>
              <div className="post-meta">
                {item.author || "unknown"} ·{" "}
                {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
            <button
              className="logout-btn"
              onClick={() => deleteImage(item.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// digitbox/pages/posts.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function PostsPage() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setPosts(data || []);
  }

  return (
    <div className="content">
      <h1>Posts</h1>

      <div className="posts-list">
        {posts.map((post) => (
          <article key={post.id} className="post-card">
            <h2>{post.title}</h2>

            <p className="post-meta">
              By {post.author} ·{" "}
              {new Date(post.created_at).toLocaleString()}
            </p>

           <ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    p: ({node, ...props}) => <p className="post-content" {...props} />,
  }}
>
  {post.content}
</ReactMarkdown>


            {post.image_url && (
              <img
                src={post.image_url}
                alt={post.title}
                className="post-image"
              />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

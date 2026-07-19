import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import PostForm from "../../components/PostForm";

const adminEmails = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export default function NewPost() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!supabase) {
      setLoadingUser(false);
      router.replace("/admin");
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data?.user || null;
      setUser(currentUser);
      setLoadingUser(false);

      if (!currentUser || !adminEmails.includes(currentUser.email)) {
        router.replace("/admin");
      }
    });
  }, [router]);

  if (loadingUser) return <div className="content">Loading...</div>;

  if (!user || !adminEmails.includes(user.email)) {
    return <div className="content">Redirecting to admin...</div>;
  }

  return (
    <div className="content">
      <h1>New Post</h1>
      <p className="admin-subtitle">Create and publish a post.</p>
      <PostForm authorEmail={user.email} />
    </div>
  );
}

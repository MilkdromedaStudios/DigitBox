import { supabase } from "../../lib/supabaseClient";

export default function PublicProfile({ profile }) {
  if (!profile) return <div className="content"><h1>Profile not found</h1></div>;
  return <div className="content"><section className="section" style={{maxWidth:640}}><div className="profile-box"><img src={profile.avatar_data_url || "https://ui-avatars.com/api/?name=User&background=333&color=fff"} className="profile-avatar" alt="avatar"/><div><h2 style={{margin:0}}>{profile.display_name || "User"}</h2><p className="post-meta">{profile.identity_label || "Member"}</p></div></div></section></div>;
}

export async function getServerSideProps({ params }) {
  if (!supabase) return { props: { profile: null } };
  const { data } = await supabase.from("profiles").select("display_name,identity_label,avatar_data_url").eq("id", params.id).maybeSingle();
  return { props: { profile: data || null } };
}

import { createClient } from "../lib/supabase/client";

export default function TestSupabase() {
  const supabase = createClient();

  async function test() {
    if (!supabase) {
      alert("Supabase environment variables are not configured.");
      return;
    }

    const { data, error } = await supabase.from("posts").select("*");

    console.log("DATA:", data);
    console.log("ERROR:", error);
    alert(error ? "Supabase error — check console" : "Supabase works!");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Supabase Test</h1>
      <button onClick={test}>Run Test</button>
    </div>
  );
}

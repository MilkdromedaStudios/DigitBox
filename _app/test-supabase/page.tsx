import { createClient } from "@/lib/supabase/client";

export default async function Page() {
  const supabase = createClient();
  const { data, error } = await supabase.from("posts").select("*");

  return (
    <pre>{JSON.stringify({ data, error }, null, 2)}</pre>
  );
}

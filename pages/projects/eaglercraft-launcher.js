import GameFrame from "../../components/GameFrame";
import { blockedBuiltIns } from "../../lib/hubProjects";
import { getD1 } from "../../lib/serverAuth";

// Server-rendered (edge, as Cloudflare Pages requires) so a launcher deleted
// or hidden from the admin page gives a 404.
export const config = { runtime: "experimental-edge" };

export default function EaglercraftLauncherPage() {
  return (
    <GameFrame
      src="/api/project-file/eaglercraft-launcher.html"
      title="Eaglercraft Launcher"
      slug="eaglercraft-launcher"
      isExternal={false}
    />
  );
}

export async function getServerSideProps() {
  const db = getD1();
  const blocked = db ? await blockedBuiltIns(db).catch(() => null) : null;
  if (blocked && blocked.has("eaglercraft-launcher")) return { notFound: true };
  return { props: {} };
}

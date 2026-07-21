import fs from "fs";
import path from "path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChangelogPage({ content }) {
  return (
    <div className="content">
      <div className="section changelog-body">
        <Markdown remarkPlugins={[remarkGfm]}>{content || "# Changelog\n\nNothing here yet."}</Markdown>
      </div>
    </div>
  );
}

export async function getStaticProps() {
  let content = "";
  try {
    content = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    content = "";
  }
  return { props: { content } };
}

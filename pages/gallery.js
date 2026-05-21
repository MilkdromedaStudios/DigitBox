// digitbox/pages/gallery.js
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";


const ALLOWED_MESSAGE_TYPES = new Set(["saveProgress", "requestProgress"]);

function isValidMessage(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (typeof data.type !== "string" || !ALLOWED_MESSAGE_TYPES.has(data.type)) return false;

  if (data.type === "saveProgress" && !("data" in data)) return false;

  return true;
}

function sanitizeProjectHtml(html) {
  if (!html) return "";

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}
export default function GalleryPage() {
  const [projects, setProjects] = useState([]);
  const [user, setUser] = useState(null);

  const [selectedProject, setSelectedProject] = useState(null);
  const [projectHtml, setProjectHtml] = useState("");
  const [savedProgress, setSavedProgress] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const iframeRef = useRef(null);

  useEffect(() => {
    loadProjects();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const handleMessage = async (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (!isValidMessage(event.data)) return;
      if (!user || !selectedProject) return;

      if (event.data.type === "saveProgress") {
        const data = event.data.data ?? null;

        await supabase.from("project_saves").upsert(
          {
            user_id: user.id,
            project_id: selectedProject.id,
            save_data: data,
          },
          { onConflict: "user_id,project_id" }
        );

        setSavedProgress(data);
      }

      if (event.data.type === "requestProgress") {
        if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: "loadProgress",
              data: savedProgress,
            },
            "*"
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [user, selectedProject, savedProgress]);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, description, likes, author, created_at")
      .order("created_at", { ascending: false });

    if (!error) setProjects(data || []);
  }

  async function openProject(project) {
    setSelectedProject(project);
    setShowModal(true);

    const { data: projData } = await supabase
      .from("projects")
      .select("html_code")
      .eq("id", project.id)
      .single();

    setProjectHtml(projData?.html_code || "");

    if (user) {
      const { data: saveData } = await supabase
        .from("project_saves")
        .select("save_data")
        .eq("user_id", user.id)
        .eq("project_id", project.id)
        .single();

      setSavedProgress(saveData?.save_data ?? null);
    } else {
      setSavedProgress(null);
    }
  }

  function closeModal() {
    setShowModal(false);
    setSelectedProject(null);
    setProjectHtml("");
    setSavedProgress(null);
  }

  async function likeProject(projectId) {
    const { data: updatedLikes, error } = await supabase.rpc(
      "increment_project_likes",
      { project_id_input: projectId }
    );

    if (error) {
      console.error("Failed to increment likes:", error);
      return;
    }

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, likes: updatedLikes ?? p.likes ?? 0 }
          : p
      )
    );
  }

  function downloadCode() {
    if (!selectedProject || !projectHtml) return;

    const blob = new Blob([projectHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedProject.title || "project"}.html`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function getIframeSrcDoc() {
    if (!selectedProject) return "";

    const title = selectedProject.title || "Project";
    const html = sanitizeProjectHtml(projectHtml || "");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
</head>
<body>
${html}

<script>
  window.addEventListener("message", function(e) {
    if (!e.data || !e.data.type) return;

    if (e.data.type === "loadProgress") {
      if (typeof window.onProgressLoaded === "function") {
        window.onProgressLoaded(e.data.data || null);
      }
    }
  });

  window.saveProgress = function(data) {
    parent.postMessage({ type: "saveProgress", data: data }, "*");
  };

  window.requestProgress = function() {
    parent.postMessage({ type: "requestProgress" }, "*");
  };

  window.requestProgress();
</script>

</body>
</html>
`;
  }

  return (
    <div className="content">
      <h1>Projects Gallery</h1>

      <div className="gallery-grid">
        {projects.map((project) => (
          <figure key={project.id} className="gallery-item">
            <h2>{project.title}</h2>
            {project.description && (
              <p className="post-meta">{project.description}</p>
            )}

            <div className="gallery-actions">
              <button
                className="auth-btn"
                onClick={() => openProject(project)}
              >
                Play
              </button>

              <button
                className="like-btn"
                onClick={() => likeProject(project.id)}
              >
                ♥ {project.likes || 0}
              </button>
            </div>
          </figure>
        ))}
      </div>

      {showModal && selectedProject && (
        <div className="project-modal">
          <div className="project-modal-inner">
            <div className="project-modal-header">
              <div>
                <h2>{selectedProject.title}</h2>
                {selectedProject.description && (
                  <p className="post-meta">
                    {selectedProject.description}
                  </p>
                )}
              </div>

              <div className="project-modal-buttons">
                <button className="auth-btn" onClick={downloadCode}>
                  Download Code
                </button>

                <button className="exit-btn" onClick={closeModal}>
                  Exit
                </button>
              </div>
            </div>

            <div className="project-modal-frame-wrapper">
              <iframe
                ref={iframeRef}
                className="project-modal-iframe"
                sandbox="allow-scripts"
                srcDoc={getIframeSrcDoc()}
                title={selectedProject.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  readChats,
  writeChats,
  newChat,
  deleteChat,
  titleFromMessages,
} from "../lib/aiChats";

const BARREL_ROLL_RE = /^\/?(do a )?barrel ?roll!?$/i;
const FREE_MODELS = [
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "SmolLM2-360M-Instruct-q4f16_1-MLC",
];
let localRuntimePromise = null;

function loadLocalRuntime() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.DigitboxLocalAI) return Promise.resolve(window.DigitboxLocalAI);
  if (localRuntimePromise) return localRuntimePromise;

  localRuntimePromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.DigitboxLocalAI) resolve(window.DigitboxLocalAI);
      else reject(new Error("Local Free AI did not initialize."));
    };

    window.addEventListener("digitbox-local-ai-ready", finish, { once: true });
    const existing = document.querySelector('script[data-digitbox-local-ai]');
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Local Free AI.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = "/local-free-ai-runtime.js";
    script.dataset.digitboxLocalAi = "1";
    script.onload = finish;
    script.onerror = () => reject(new Error("Could not load Local Free AI."));
    document.head.appendChild(script);
  });

  return localRuntimePromise;
}

export default function DigitboxAiPage() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [configured, setConfigured] = useState(null);
  const [model, setModel] = useState(FREE_MODELS[0]);
  const [aiMode, setAiMode] = useState("free");
  const [freeReady, setFreeReady] = useState(false);
  const [freeSupported, setFreeSupported] = useState(true);
  const [showApi, setShowApi] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    let loaded = readChats();
    if (loaded.length === 0) loaded = [newChat()];
    setChats(loaded);
    setActiveId(loaded[0].id);

    loadLocalRuntime()
      .then((runtime) => {
        setFreeReady(Boolean(runtime));
        setFreeSupported(Boolean(runtime?.supported?.()));
      })
      .catch(() => {
        setFreeReady(false);
        setFreeSupported(false);
      });

    fetch("/api/ai/request?info=1")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));

    const onProgress = (event) => {
      const value = Math.max(0, Math.min(1, Number(event.detail?.value || 0)));
      if (value >= 1) {
        setStatus("");
        return;
      }
      setStatus(`Loading Local Free AI… ${Math.round(value * 100)}%`);
    };
    window.addEventListener("digitbox-local-ai-progress", onProgress);
    return () => window.removeEventListener("digitbox-local-ai-progress", onProgress);
  }, []);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) || null,
    [chats, activeId]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeChat?.messages?.length, sending]);

  function persist(next) {
    setChats(next);
    writeChats(next);
  }

  function setActiveMessages(messages) {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== activeId) return c;
        const merged = { ...c, messages, updatedAt: Date.now() };
        if ((!merged.title || merged.title === "New chat") && messages.length) {
          merged.title = titleFromMessages(messages);
        }
        return merged;
      });
      const active = updated.find((c) => c.id === activeId);
      const ordered = active ? [active, ...updated.filter((c) => c.id !== activeId)] : updated;
      writeChats(ordered);
      return ordered;
    });
  }

  function startNewChat() {
    const c = newChat();
    persist([c, ...chats]);
    setActiveId(c.id);
    setInput("");
    setStatus("");
  }

  function removeChat(id, e) {
    e?.stopPropagation?.();
    let next = deleteChat(chats, id);
    if (next.length === 0) next = [newChat()];
    persist(next);
    if (activeId === id) setActiveId(next[0].id);
  }

  function triggerBarrelRoll() {
    if (typeof document === "undefined") return;
    document.body.classList.add("egg-barrel-roll");
    window.setTimeout(() => document.body.classList.remove("egg-barrel-roll"), 1000);
  }

  async function send(e) {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || sending || !activeChat) return;

    if (BARREL_ROLL_RE.test(text)) {
      triggerBarrelRoll();
      setActiveMessages([
        ...activeChat.messages,
        { role: "user", content: text },
        { role: "assistant", content: "🌀 Wheee! Doing a barrel roll!" },
      ]);
      setInput("");
      return;
    }

    const history = [...activeChat.messages, { role: "user", content: text }];
    setActiveMessages(history);
    setInput("");
    setSending(true);
    setStatus("");

    try {
      if (aiMode === "free") {
        const runtime = await loadLocalRuntime();
        if (!runtime?.supported?.()) {
          setFreeSupported(false);
          setStatus("This browser cannot run Local Free AI because WebGPU is unavailable. Your chat is saved; choose Site AI if available.");
          return;
        }

        let lastError = null;
        for (let i = 0; i < FREE_MODELS.length; i += 1) {
          const candidate = FREE_MODELS[i];
          try {
            const result = await runtime.chat(history, {
              model: candidate,
              task: "chat",
              maxTokens: 900,
              temperature: 0.65,
            });
            setActiveMessages([...history, { role: "assistant", content: result.text }]);
            setModel(result.model || candidate);
            if (i > 0) setStatus(`Using local fallback · ${shortModel(candidate)}`);
            return;
          } catch (error) {
            lastError = error;
            console.warn(`Local Free AI model ${candidate} failed`, error);
          }
        }
        throw lastError || new Error("Local Free AI could not run on this device.");
      }

      if (!configured) {
        setStatus("Site AI is not configured. Switch back to Local Free AI.");
        return;
      }

      const res = await fetch("/api/ai/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data.error || "Site AI request failed. Switch to Local Free AI or try again.");
        return;
      }
      setActiveMessages([...history, { role: "assistant", content: data.reply }]);
      if (data.model) setModel(data.model);
    } catch (error) {
      setStatus(error?.message || "AI request failed. Your chat is saved.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e);
    }
  }

  function switchMode(next) {
    if (next === "site" && !configured) {
      setStatus("Site AI is not configured on this deployment.");
      return;
    }
    setAiMode(next);
    setStatus("");
    setModel(next === "free" ? FREE_MODELS[0] : "Site AI");
  }

  const messages = activeChat?.messages || [];

  return (
    <div className="content ai-page">
      <div className="ai-head">
        <h1>
          Digitbox <span className="ai-grad">AI</span>
        </h1>
        <p className="post-meta">
          Your friendly built-in assistant · {aiMode === "free" ? "Local Free AI" : "Site AI"}
          {model ? ` · ${shortModel(model)}` : ""}. Chats are saved on this device.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button
            type="button"
            className={aiMode === "free" ? "auth-btn" : "ghost-btn"}
            onClick={() => switchMode("free")}
            title="Runs locally in your browser with no sign-in or API key"
          >
            ✦ Local Free AI{!freeSupported ? " · unsupported" : freeReady ? "" : " · loading"}
          </button>
          <button
            type="button"
            className={aiMode === "site" ? "auth-btn" : "ghost-btn"}
            onClick={() => switchMode("site")}
            disabled={!configured}
            title={configured ? "Use the server-configured Digitbox AI provider" : "No server AI provider is configured"}
          >
            Site AI{configured ? "" : " · unavailable"}
          </button>
        </div>
      </div>

      <div className="ai-shell">
        <aside className="ai-sidebar">
          <button type="button" className="auth-btn ai-newchat" onClick={startNewChat}>
            + New chat
          </button>
          <div className="ai-chatlist">
            {chats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ai-chatitem${c.id === activeId ? " is-active" : ""}`}
                onClick={() => setActiveId(c.id)}
                title={c.title}
              >
                <span className="ai-chatitem-title">{c.title || "New chat"}</span>
                <span
                  className="ai-chatitem-del"
                  role="button"
                  tabIndex={0}
                  aria-label="Delete chat"
                  onClick={(e) => removeChat(c.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") removeChat(c.id, e);
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="ai-main">
          <div className="ai-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <p className="ai-empty-title">👋 Say hi to Digitbox AI</p>
                <p className="post-meta">Ask for game tips, ideas, coding help, or anything at all.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role}`}>
                <div className="ai-msg-role">{m.role === "user" ? "You" : "Digitbox AI"}</div>
                <div className="ai-msg-body">{m.content}</div>
              </div>
            ))}
            {sending && (
              <div className="ai-msg ai-msg-assistant">
                <div className="ai-msg-role">Digitbox AI</div>
                <div className="ai-msg-body ai-typing" aria-label="Thinking">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>

          {status && <div className="ai-error">{status}</div>}

          <form className="ai-input-row" onSubmit={send}>
            <textarea
              className="auth-input ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Digitbox AI…  (Enter to send, Shift+Enter for a new line)"
              rows={1}
              aria-label="Message Digitbox AI"
            />
            <button type="submit" className="auth-btn ai-send" disabled={sending || !input.trim()}>
              {sending ? "…" : "Send"}
            </button>
          </form>
        </section>
      </div>

      <section className="section ai-api">
        <button
          type="button"
          className="ai-api-toggle"
          onClick={() => setShowApi((v) => !v)}
          aria-expanded={showApi}
        >
          <h2>Developer API {showApi ? "▲" : "▼"}</h2>
        </button>
        <p className="post-meta">
          The public JSON API remains server-backed. Local Free AI is available in the website chat above.
        </p>
        {showApi && (
          <div className="ai-api-body">
            <p><strong>GET</strong> — quick one-off prompt:</p>
            <pre className="octo-code">{`https://digitbox.dev/ai/api/request?message=Write a haiku about pixels`}</pre>
            <pre className="octo-code">{`https://digitbox.dev/ai/api/request/Write%20a%20haiku%20about%20pixels`}</pre>
            <p><strong>POST</strong> — full conversation:</p>
            <pre className="octo-code">{`fetch("https://digitbox.dev/api/ai/request", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [
      { role: "user", content: "Hello, Digitbox AI!" }
    ]
  })
}).then(r => r.json()).then(console.log)`}</pre>
            <p><strong>Response</strong>:</p>
            <pre className="octo-code">{`{ "ok": true, "reply": "…", "model": "…" }`}</pre>
            <p className="post-meta">
              Server API errors return <code>{`{ "ok": false, "error": "…" }`}</code>. If no server provider is configured it returns 503; Local Free AI above still works independently on supported browsers.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function shortModel(value = "") {
  return String(value)
    .replace(/-Instruct.*$/i, "")
    .replace(/-q\w+.*$/i, "") || value;
}

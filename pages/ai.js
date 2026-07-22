import { useEffect, useMemo, useRef, useState } from "react";
import {
  readChats,
  writeChats,
  newChat,
  deleteChat,
  titleFromMessages,
} from "../lib/aiChats";

const BARREL_ROLL_RE = /^\/?(do a )?barrel ?roll!?$/i;

export default function DigitboxAiPage() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [configured, setConfigured] = useState(null); // null = unknown
  const [model, setModel] = useState("");
  const [showApi, setShowApi] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    let loaded = readChats();
    if (loaded.length === 0) loaded = [newChat()];
    setChats(loaded);
    setActiveId(loaded[0].id);

    fetch("/api/ai/request?info=1")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.configured));
        if (d.model) setModel(d.model);
      })
      .catch(() => setConfigured(false));
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

    // 🥚 Secret command
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
      const res = await fetch("/api/ai/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data.error || "Request failed. Please try again.");
        return;
      }
      setActiveMessages([...history, { role: "assistant", content: data.reply }]);
      if (data.model) setModel(data.model);
      if (configured === false) setConfigured(true);
    } catch {
      setStatus("Network error — please try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const messages = activeChat?.messages || [];

  return (
    <div className="content ai-page">
      <div className="ai-head">
        <h1>
          Digitbox <span className="ai-grad">AI</span>
        </h1>
        <p className="post-meta">
          Your friendly built-in assistant{model ? ` · ${model}` : ""}. Chats are saved on
          this device.
        </p>
      </div>

      {configured === false && (
        <div className="notice notice-warn" role="status">
          <strong>Digitbox AI isn&apos;t switched on yet.</strong> This deployment has no
          <code> AI_API_KEY</code> set. An admin can add a free key — GitHub Models (a
          GitHub token), Groq, Google Gemini, OpenRouter or Hugging Face — in the hosting
          env; see <code>docs/DIGITBOX_AI_SETUP.md</code>. You can still browse the chat
          and API docs below.
        </div>
      )}

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
                <p className="post-meta">Ask for game tips, ideas, or anything at all.</p>
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
                  <span></span>
                  <span></span>
                  <span></span>
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
          Call Digitbox AI from your own code. Public JSON endpoint, CORS-enabled.
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
              Errors return <code>{`{ "ok": false, "error": "…" }`}</code> with an HTTP status
              (503 when unconfigured, 429 when rate-limited).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

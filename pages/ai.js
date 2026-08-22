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
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "cohere/north-mini-code:free",
  "liquid/lfm-2.5-2.6b:free",
];
let puterLoadPromise = null;

function preloadPuter() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.puter?.ai?.chat) return Promise.resolve(window.puter);
  if (puterLoadPromise) return puterLoadPromise;

  puterLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-digitbox-puter]");
    if (existing) {
      if (window.puter?.ai?.chat) return resolve(window.puter);
      existing.addEventListener("load", () => resolve(window.puter), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Free AI.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.dataset.digitboxPuter = "1";
    script.onload = () => window.puter?.ai?.chat
      ? resolve(window.puter)
      : reject(new Error("Free AI did not initialize."));
    script.onerror = () => reject(new Error("Could not load Free AI."));
    document.head.appendChild(script);
  });
  return puterLoadPromise;
}

function beginFreeAuthFromGesture() {
  if (typeof window === "undefined" || !window.puter?.auth) return null;
  try {
    if (window.puter.auth.isSignedIn?.()) return Promise.resolve(true);
    // Puter documents temporary-user creation as the fast onboarding path.
    // Starting it here (before any await) keeps it tied to the Send click.
    return window.puter.auth.signIn({ attempt_temp_user_creation: true });
  } catch (error) {
    return Promise.reject(error);
  }
}

function normalizePuterMessages(messages) {
  return (messages || []).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content || ""),
  }));
}

function puterText(response) {
  const content = response?.message?.content ?? response?.content ?? response;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
  }
  return "";
}

async function freeCompletion(messages) {
  if (!window.puter?.ai?.chat) throw new Error("Free AI is still loading — press Send again in a moment.");
  let lastError = null;

  for (let i = 0; i < FREE_MODELS.length; i += 1) {
    const candidate = FREE_MODELS[i];
    try {
      const response = await window.puter.ai.chat(normalizePuterMessages(messages), {
        model: candidate,
        temperature: 0.65,
        max_tokens: 1400,
      });
      const reply = puterText(response);
      if (!reply) throw new Error("The free model returned an empty response.");
      return { reply, model: candidate, fallback: i > 0 };
    } catch (error) {
      lastError = error;
      console.warn(`Digitbox Free AI model ${candidate} failed`, error);
    }
  }

  const raw = String(lastError?.message || lastError || "").toLowerCase();
  if (/quota|limit|rate|credits|balance|429|too many|capacity/.test(raw)) {
    throw new Error("Free AI hit a usage or capacity limit. Your chat is saved. Retry later or switch to Site AI if it is available.");
  }
  throw new Error("Free AI is temporarily unavailable. Your chat is saved — retry or switch to Site AI if available.");
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
  const [showApi, setShowApi] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    let loaded = readChats();
    if (loaded.length === 0) loaded = [newChat()];
    setChats(loaded);
    setActiveId(loaded[0].id);

    preloadPuter()
      .then(() => setFreeReady(true))
      .catch(() => setFreeReady(false));

    fetch("/api/ai/request?info=1")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
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

    // Start Puter auth from the actual user gesture before any await/state work.
    const freeAuth = aiMode === "free" ? beginFreeAuthFromGesture() : null;

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
        if (!window.puter?.ai?.chat) {
          preloadPuter().catch(() => {});
          setStatus("Free AI is finishing setup — press Send again in a moment.");
          return;
        }
        if (freeAuth) await freeAuth;
        const result = await freeCompletion(history);
        setActiveMessages([...history, { role: "assistant", content: result.reply }]);
        setModel(result.model);
        if (result.fallback) setStatus(`Free fallback in use · ${result.model}`);
      } else {
        if (!configured) {
          setStatus("Site AI is not configured. Switch back to Free AI.");
          return;
        }
        const res = await fetch("/api/ai/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setStatus(data.error || "Site AI request failed. Switch to Free AI or try again.");
          return;
        }
        setActiveMessages([...history, { role: "assistant", content: data.reply }]);
        if (data.model) setModel(data.model);
      }
    } catch (error) {
      const raw = String(error?.error || error?.code || error?.message || "");
      if (/auth_window_closed|cancel/i.test(raw)) {
        setStatus("Free AI setup was cancelled. Your message is saved — press Send when you want to continue.");
      } else {
        setStatus(error?.message || "AI request failed. Your chat is saved.");
      }
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
      setStatus("Site AI is not configured on this deployment. Free AI is still available.");
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
          Your friendly built-in assistant · {aiMode === "free" ? "Free AI" : "Site AI"}
          {model ? ` · ${model}` : ""}. Chats are saved on this device.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button
            type="button"
            className={aiMode === "free" ? "auth-btn" : "ghost-btn"}
            onClick={() => switchMode("free")}
          >
            ✦ Free AI{freeReady ? " · ready" : " · loading"}
          </button>
          <button
            type="button"
            className={aiMode === "site" ? "auth-btn" : "ghost-btn"}
            onClick={() => switchMode("site")}
            disabled={!configured}
            title={configured ? "Use the server-configured Digitbox AI provider" : "No server AI key is configured"}
          >
            Site AI{configured ? "" : " · unavailable"}
          </button>
        </div>
      </div>

      <div className="notice" role="status">
        <strong>Free AI is the default.</strong> No API key is needed. It tries multiple $0 hosted models and stays in this chat. On first use, Puter may create a temporary user so the free models can run. If free capacity is exhausted, Digitbox warns you instead of silently switching to a paid provider.
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
          The public JSON API remains server-backed. The website chat above can use Free AI without a server key.
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
              Server API errors return <code>{`{ "ok": false, "error": "…" }`}</code>. If no server provider is configured it returns 503; the browser Free AI above still works independently.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

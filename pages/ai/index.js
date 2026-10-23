import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Icon from "../../components/Icon";
import { CLOUD_AUTH_UPDATED_EVENT } from "../../lib/account";
import { STATIC_DEMO_URL, loadAiStatus, splitReply, streamAiChat } from "../../lib/aiClient";
import { newChat, readChats, titleFromMessages, writeChats } from "../../lib/aiChats";

const MODEL_KEY = "digitbox_ai_model_v1";
const BARREL_ROLL = /^\/?(do a )?barrel ?roll!?$/i;

const SUGGESTIONS = [
  { icon: "games", title: "Get unstuck in a game", prompt: "I'm stuck in a game. Ask me which game and where I'm stuck, then give me small hints before any spoilers." },
  { icon: "ai", title: "Make an image", prompt: "Make an SVG image of a cozy arcade at night with glowing neon signs, as a file I can download." },
  { icon: "file", title: "Plan my week", prompt: "Help me plan my week as a Markdown checklist file. Ask me what I need to get done first." },
  { icon: "play", title: "Code a mini game", prompt: "Write a tiny one-file HTML5 game I can download and open in my browser. Keep it fun and simple." },
];

function shortDate(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}

function sizeLabel(text) {
  const bytes = new Blob([text]).size;
  return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(1) + " KB";
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => null);
}

function FileCard({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file.complete) return undefined;
    const next = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file.complete, file.content, file.mime]);

  return (
    <div className="ai-file">
      {/* An <img> can't run scripts inside the SVG, so the preview is safe. */}
      {file.mime === "image/svg+xml" && url && <img className="ai-file-preview" src={url} alt={"Preview of " + file.name} />}
      <div className="ai-file-row">
        <span className="ai-file-icon"><Icon name="file" size={20} /></span>
        <span className="ai-file-meta">
          <strong>{file.name}</strong>
          <small>{file.complete ? sizeLabel(file.content) : "Writing…"}</small>
        </span>
        {file.complete && (
          <>
            <button type="button" className="hub-icon-btn ai-mini-btn" aria-label={"Copy " + file.name} title="Copy" onClick={() => copyText(file.content)}>
              <Icon name="copy" size={18} />
            </button>
            <a className="hub-pill-btn" href={url} download={file.name}>
              <Icon name="download" size={18} />
              Download
            </a>
          </>
        )}
      </div>
    </div>
  );
}

const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

function Reply({ text }) {
  const parts = useMemo(() => splitReply(text), [text]);
  return parts.map((part, index) =>
    part.type === "file" ? (
      <FileCard key={index} file={part} />
    ) : (
      <div className="ai-md" key={index}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {part.text}
        </ReactMarkdown>
      </div>
    )
  );
}

function Message({ message, streaming }) {
  if (message.role === "user") {
    return (
      <article className="ai-msg is-user" aria-label="Your message">
        <div className="ai-bubble">{message.content}</div>
      </article>
    );
  }
  return (
    <article className="ai-msg is-assistant" aria-label="DigitBox AI">
      <img className="ai-msg-mark" src="/favicon.svg" alt="" width={30} height={30} />
      <div className="ai-msg-body">
        <div className="ai-msg-label">
          DigitBox AI{message.model ? <span> · {message.model}</span> : null}
        </div>
        {message.content ? <Reply text={message.content} /> : <div className="ai-typing" aria-label="Thinking"><span /><span /><span /></div>}
        {streaming ? null : (
          <div className="ai-msg-actions">
            {message.stopped && <span className="ai-msg-note">Stopped</span>}
            <button type="button" className="hub-icon-btn ai-mini-btn" aria-label="Copy reply" title="Copy" onClick={() => copyText(message.content)}>
              <Icon name="copy" size={17} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function PlanPill({ status }) {
  if (!status?.signedIn) return null;
  if (status.plan === "pro") {
    return (
      <span className="ai-plan is-pro" title="DigitBox Pro: every model, no daily limit">
        <Icon name="pro" size={16} />
        Pro · Unlimited
      </span>
    );
  }
  const left = status.usage?.remaining ?? status.freeDailyLimit;
  return (
    <Link href="/profile#digitbox-pro" className="ai-plan" title="Free plan. Upgrade to DigitBox Pro for unlimited chats.">
      Free · {left} {left === 1 ? "message" : "messages"} left today
    </Link>
  );
}

export default function DigitBoxAiPage() {
  const [status, setStatus] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(null);
  const [notice, setNotice] = useState(null);
  const [modelId, setModelId] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const abortRef = useRef(null);
  const streamTextRef = useRef("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  async function refreshStatus() {
    try {
      const next = await loadAiStatus();
      setStatus(next);
      return next;
    } catch (error) {
      setStatus({ error: error?.message || "Couldn't reach DigitBox AI.", models: [] });
      return null;
    }
  }

  useEffect(() => {
    const saved = readChats();
    const first = saved[0] || newChat();
    setChats(saved.length ? saved : [first]);
    setActiveId(first.id);
    refreshStatus();
    window.addEventListener(CLOUD_AUTH_UPDATED_EVENT, refreshStatus);
    return () => {
      window.removeEventListener(CLOUD_AUTH_UPDATED_EVENT, refreshStatus);
      abortRef.current?.abort();
    };
  }, []);

  // Pick a model the plan may use: the saved choice when allowed, else the plan's default.
  useEffect(() => {
    if (!status?.models) return;
    let saved = "";
    try {
      saved = localStorage.getItem(MODEL_KEY) || "";
    } catch (_) {
      saved = "";
    }
    const usable = (id) => status.models.some((m) => m.id === id && !m.locked && m.configured);
    setModelId(usable(saved) ? saved : status.defaultModel || status.models.find((m) => !m.locked)?.id || "");
  }, [status]);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) || null, [chats, activeId]);
  const messages = activeChat?.messages || [];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, streaming?.text, activeId]);

  // The composer grows with its text (up to its CSS max-height).
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = node.scrollHeight + "px";
  }, [input]);

  function saveChats(updater) {
    setChats((previous) => {
      const next = updater(previous);
      writeChats(next);
      return next;
    });
  }

  function updateMessages(chatId, update) {
    saveChats((previous) => {
      const updated = previous.map((chat) => {
        if (chat.id !== chatId) return chat;
        const nextMessages = update(chat.messages);
        return {
          ...chat,
          messages: nextMessages,
          title: chat.title === "New chat" ? titleFromMessages(nextMessages) : chat.title,
          updatedAt: Date.now(),
        };
      });
      const active = updated.find((chat) => chat.id === chatId);
      return active ? [active, ...updated.filter((chat) => chat.id !== chatId)] : updated;
    });
  }

  function startNewChat() {
    if (streaming) return;
    const fresh = newChat();
    setChats((previous) => [fresh, ...previous.filter((chat) => chat.messages.length)]);
    setActiveId(fresh.id);
    setNotice(null);
    setListOpen(false);
    inputRef.current?.focus();
  }

  function openChat(id) {
    if (streaming) return;
    setActiveId(id);
    setNotice(null);
    setListOpen(false);
  }

  function removeChat(id) {
    if (streaming) return;
    const rest = chats.filter((chat) => chat.id !== id);
    const next = rest.length ? rest : [newChat()];
    setChats(next);
    writeChats(next);
    if (id === activeId) setActiveId(next[0].id);
  }

  function chooseModel(id) {
    setModelId(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch (_) {
      /* private mode */
    }
  }

  async function send(text) {
    const prompt = String(text || "").trim();
    if (!prompt || streaming || !activeChat) return;
    if (!status?.signedIn) {
      setNotice({ code: "signed_out", message: "Sign in to DigitBox to chat with DigitBox AI." });
      return;
    }
    const chatId = activeChat.id;
    setInput("");
    setNotice(null);

    if (BARREL_ROLL.test(prompt)) {
      document.body.classList.add("egg-barrel-roll");
      window.setTimeout(() => document.body.classList.remove("egg-barrel-roll"), 1000);
      updateMessages(chatId, (list) => [...list, { role: "user", content: prompt }, { role: "assistant", content: "🌀 Wheee! Doing a barrel roll!" }]);
      return;
    }

    const history = [...activeChat.messages, { role: "user", content: prompt }];
    updateMessages(chatId, () => history);
    const controller = new AbortController();
    abortRef.current = controller;
    streamTextRef.current = "";
    setStreaming({ chatId, text: "" });
    const modelLabel = status.models.find((m) => m.id === modelId)?.label || "";

    try {
      const result = await streamAiChat({
        messages: history.map(({ role, content }) => ({ role, content })),
        model: modelId,
        signal: controller.signal,
        onText: (value) => {
          streamTextRef.current = value;
          setStreaming({ chatId, text: value });
        },
      });
      updateMessages(chatId, (list) => [...list, { role: "assistant", content: result.text, model: result.model || modelLabel }]);
    } catch (error) {
      const partial = streamTextRef.current || error?.partial || "";
      if (partial) updateMessages(chatId, (list) => [...list, { role: "assistant", content: partial, model: modelLabel, stopped: true }]);
      if (error?.name !== "AbortError") setNotice({ code: error?.code || "", message: error?.message || "DigitBox AI request failed." });
    } finally {
      abortRef.current = null;
      setStreaming(null);
      refreshStatus();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    send(input);
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  }

  const loading = status === null;
  const signedIn = Boolean(status?.signedIn);
  const offline = Boolean(status && (status.storage === false || status.configured === false || (status.error && !status.signedIn && !status.models?.length)));
  const freeModel = status?.models?.find((m) => m.tier === "free");
  const proModel = status?.models?.find((m) => m.tier === "pro");
  const showStreaming = streaming && streaming.chatId === activeId;
  const canSend = signedIn && !offline && !streaming && Boolean(modelId);

  return (
    <>
      <Head>
        <title>DigitBox AI - DigitBox</title>
        <meta name="description" content="DigitBox AI, powered by Static: chat, plan, write and make files. Free with a DigitBox account, unlimited with DigitBox Pro." />
      </Head>

      <div className={"ai-page" + (listOpen ? " is-list-open" : "")}>
        <aside className="ai-list" aria-label="Your chats">
          <button type="button" className="hub-pill-btn is-primary ai-new" onClick={startNewChat} disabled={Boolean(streaming)}>
            <Icon name="plus" size={18} />
            New chat
          </button>
          <div className="ai-list-title">Recent</div>
          <div className="ai-list-items">
            {chats.filter((chat) => chat.messages.length || chat.id === activeId).map((chat) => (
              <div key={chat.id} className={"ai-list-item" + (chat.id === activeId ? " is-active" : "")}>
                <button type="button" className="ai-list-open" onClick={() => openChat(chat.id)} title={chat.title}>
                  <span>{chat.title || "New chat"}</span>
                  {chat.messages.length > 0 && <small>{shortDate(chat.updatedAt)}</small>}
                </button>
                {chat.messages.length > 0 && (
                  <button type="button" className="hub-icon-btn ai-mini-btn" aria-label={"Delete " + chat.title} title="Delete" onClick={() => removeChat(chat.id)}>
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="ai-list-foot">
            <span>Chats are saved on this device.</span>
            <a href={STATIC_DEMO_URL} target="_blank" rel="noopener noreferrer">
              Powered by Static <Icon name="external" size={14} />
            </a>
          </div>
        </aside>
        <div className="ai-list-scrim" onClick={() => setListOpen(false)} aria-hidden="true" />

        <section className="ai-chat">
          <header className="ai-chat-head">
            <button type="button" className="hub-icon-btn ai-list-toggle" aria-label="Show chats" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
              <Icon name="list" />
            </button>
            <div className="ai-title">
              <h1>
                DigitBox <span className="ai-grad">AI</span>
              </h1>
              <small>Powered by Static</small>
            </div>
            <div className="ai-head-end">
              <PlanPill status={status} />
              {signedIn && status.models?.length > 0 && (
                <label className="ai-model">
                  <span className="sr-only">Model</span>
                  <select value={modelId} onChange={(event) => chooseModel(event.target.value)} disabled={Boolean(streaming)}>
                    {status.models.map((model) => (
                      <option key={model.id} value={model.id} disabled={model.locked || !model.configured}>
                        {model.label}
                        {model.locked ? " · Pro" : !model.configured ? " · off" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </header>

          <div className="ai-scroll" ref={scrollRef}>
            <div className="ai-thread">
              {messages.length === 0 && !showStreaming && (
                <div className="ai-welcome">
                  <div className="ai-welcome-mark">
                    <Icon name="ai" size={30} />
                  </div>
                  <h2>{signedIn ? "What can I help with, " + (status.user?.displayName || "friend") + "?" : "Meet DigitBox AI"}</h2>
                  <p>Game hints, ideas, writing, plans and little files you can download. Powered by Static.</p>

                  {!loading && !signedIn && !offline && (
                    <div className="ai-plans">
                      <div className="ai-plan-card">
                        <small>FREE ACCOUNT</small>
                        <strong>{status.freeDailyLimit} messages a day</strong>
                        <span>with {freeModel?.label || "Nemotron"}</span>
                      </div>
                      <div className="ai-plan-card is-pro">
                        <small>DIGITBOX PRO</small>
                        <strong>Unlimited chats</strong>
                        <span>
                          {proModel ? proModel.label + " and " : ""}
                          {freeModel?.label || "Nemotron"}
                        </span>
                      </div>
                      <Link href="/login?next=/ai" className="hub-pill-btn is-primary ai-plans-cta">
                        <Icon name="login" size={18} />
                        Sign in to start
                      </Link>
                    </div>
                  )}

                  {signedIn && !offline && (
                    <div className="ai-suggestions">
                      {SUGGESTIONS.map((item) => (
                        <button key={item.title} type="button" className="ai-suggestion" onClick={() => send(item.prompt)}>
                          <Icon name={item.icon} size={20} />
                          <strong>{item.title}</strong>
                          <span>{item.prompt}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((message, index) => (
                <Message key={index} message={message} />
              ))}
              {showStreaming && <Message message={{ role: "assistant", content: streaming.text }} streaming />}
            </div>
          </div>

          <div className="ai-bottom">
            {offline && (
              <div className="ai-notice">
                <Icon name="info" size={20} />
                <span>{status.error || "DigitBox AI isn't switched on yet. The site owner needs to add an AI API key."}</span>
              </div>
            )}
            {notice && (
              <div className={"ai-notice" + (notice.code === "limit_reached" || notice.code === "pro_required" ? " is-pro" : " is-error")} role="alert">
                <Icon name={notice.code === "limit_reached" || notice.code === "pro_required" ? "pro" : "info"} size={20} />
                <span>{notice.message}</span>
                {(notice.code === "limit_reached" || notice.code === "pro_required") && status?.plan !== "pro" && (
                  <Link href="/profile#digitbox-pro" className="hub-pill-btn is-primary">Get Pro</Link>
                )}
                {notice.code === "signed_out" && (
                  <Link href="/login?next=/ai" className="hub-pill-btn is-primary">Sign in</Link>
                )}
                <button type="button" className="hub-icon-btn ai-mini-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>
                  <Icon name="close" size={17} />
                </button>
              </div>
            )}
            <form className="ai-composer" onSubmit={onSubmit}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={signedIn ? "Message DigitBox AI" : "Sign in to message DigitBox AI"}
                aria-label="Message DigitBox AI"
                rows={1}
                maxLength={16000}
                disabled={!signedIn || offline}
              />
              {streaming ? (
                <button type="button" className="ai-send is-stop" aria-label="Stop" title="Stop" onClick={() => abortRef.current?.abort()}>
                  <Icon name="stop" size={18} />
                </button>
              ) : (
                <button type="submit" className="ai-send" aria-label="Send" title="Send" disabled={!canSend || !input.trim()}>
                  <Icon name="send" size={20} strokeWidth={2.2} />
                </button>
              )}
            </form>
            <p className="ai-fineprint">
              DigitBox AI can make mistakes. Don&apos;t share passwords or private details.
              {status?.plan === "free" ? " Free messages reset every day at midnight UTC." : ""}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

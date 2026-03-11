import React, { useMemo, useState } from "react";

export default function ChatThread({
  title = "Conversation",
  currentUserId,
  messages,
  busy,
  placeholder = "Ecris ton message...",
  onSend,
  onMarkRead,
  onDeleteHistory
}) {
  const [draft, setDraft] = useState("");

  const items = useMemo(
    () =>
      (Array.isArray(messages) ? messages : [])
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );

  const unread = items.some((item) => !item.readAt && item.senderId !== currentUserId);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !onSend) return;
    await onSend(text);
    setDraft("");
  };

  const clearHistory = async () => {
    if (!onDeleteHistory || items.length === 0) return;
    const confirmed = window.confirm("Supprimer tout l'historique de cette conversation ?");
    if (!confirmed) return;
    await onDeleteHistory();
  };

  return (
    <section className="chat-thread">
      <div className="row-between">
        <strong>{title}</strong>
        <div className="chat-actions">
          {unread ? (
            <button className="ghost" type="button" disabled={busy} onClick={onMarkRead}>
              Marquer comme lu
            </button>
          ) : null}
          {items.length > 0 ? (
            <button className="danger" type="button" disabled={busy} onClick={clearHistory}>
              Supprimer l'historique
            </button>
          ) : null}
        </div>
      </div>
      <div className="chat-list">
        {items.length === 0 ? <p className="info-text">Aucun message pour le moment.</p> : null}
        {items.map((item) => {
          const mine = item.senderId === currentUserId;
          return (
            <article key={item.id} className={`chat-bubble ${mine ? "is-mine" : "is-theirs"}`}>
              <p>{item.message}</p>
              <small>{new Date(item.createdAt).toLocaleString("fr-FR")}</small>
            </article>
          );
        })}
      </div>
      <div className="chat-compose">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={busy}
        />
        <button className="primary" type="button" disabled={busy || !draft.trim()} onClick={submit}>
          Envoyer
        </button>
      </div>
    </section>
  );
}

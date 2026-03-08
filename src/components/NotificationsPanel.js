import React from "react";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export default function NotificationsPanel({
  items,
  busy,
  onMarkRead,
  onDelete,
  title = "Notifications"
}) {
  const notifications = Array.isArray(items) ? items : [];

  return (
    <section className="panel notifications-panel">
      <div className="row-between">
        <h3>{title}</h3>
        <span className="notif-count">
          {notifications.filter((item) => !item.readAt).length} non lues
        </span>
      </div>

      {notifications.length === 0 ? <p>Aucune notification.</p> : null}

      <ul className="simple-list">
        {notifications.map((item) => (
          <li key={item.id} className={`notif-item ${item.readAt ? "is-read" : "is-unread"}`}>
            <div className="notif-main">
              <strong>{item.title}</strong>
              {item.body ? <p>{item.body}</p> : null}
              <small>{formatDate(item.createdAt)}</small>
            </div>
            <div className="notif-actions">
              {!item.readAt ? (
                <button className="ghost" type="button" disabled={busy} onClick={() => onMarkRead(item.id)}>
                  Marquer lu
                </button>
              ) : null}
              <button className="danger" type="button" disabled={busy} onClick={() => onDelete(item.id)}>
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

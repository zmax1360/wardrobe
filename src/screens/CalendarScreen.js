import React, { useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

export function CalendarScreen({
  events,
  setEvents,
  baseTransition,
  emptyEventForm,
  todayYmdLocal,
  CAL_OCCASION_TYPES,
  CAL_DRESS_CODES,
  formatDisplayDate,
  daysRelativeLabel,
}) {
  const [form, setForm] = useState(emptyEventForm);
  const [editingId, setEditingId] = useState(null);
  const [pastOpen, setPastOpen] = useState(false);

  const today = todayYmdLocal();
  const sortedUpcoming = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const sortedPast = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date < today)
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  }, [events, today]);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyEventForm());
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || "",
      date: ev.date || "",
      occasionType: ev.occasionType || CAL_OCCASION_TYPES[0],
      dressCode: ev.dressCode || CAL_DRESS_CODES[0],
      location: ev.location || "",
      notes: ev.notes || "",
    });
  };

  const saveEvent = () => {
    const title = form.title.trim();
    const date = form.date;
    if (!title || !date) return;
    const createdAt = new Date().toISOString();
    if (editingId) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? {
                ...e,
                title,
                date,
                occasionType: form.occasionType,
                dressCode: form.dressCode,
                location: form.location.trim(),
                notes: form.notes,
              }
            : e
        )
      );
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      setEvents((prev) => [
        ...prev,
        {
          id,
          title,
          date,
          occasionType: form.occasionType,
          dressCode: form.dressCode,
          location: form.location.trim(),
          notes: form.notes,
          createdAt,
        },
      ]);
    }
    startNew();
  };

  const deleteEvent = (id) => {
    if (!window.confirm("Delete this event?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) startNew();
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "0.9rem",
  };

  const labelStyle = { display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Calendar
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 24px", fontSize: "0.9rem" }}>Plan outfits around your schedule.</p>

      <div
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          padding: 24,
          border: `1px solid ${COLORS.border}`,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "1.2rem",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {editingId ? "Edit event" : "Add event"}
        </div>
        <label style={labelStyle}>Title *</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Date *</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Occasion type</label>
        <select
          value={form.occasionType}
          onChange={(e) => setForm((f) => ({ ...f, occasionType: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14, cursor: "pointer" }}
        >
          {CAL_OCCASION_TYPES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <label style={labelStyle}>Dress code</label>
        <select
          value={form.dressCode}
          onChange={(e) => setForm((f) => ({ ...f, dressCode: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14, cursor: "pointer" }}
        >
          {CAL_DRESS_CODES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <label style={labelStyle}>Location</label>
        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Optional"
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, marginBottom: 16, resize: "vertical", minHeight: 72 }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveEvent}
            disabled={!form.title.trim() || !form.date}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: form.title.trim() && form.date ? COLORS.primary : COLORS.border,
              color: "#FFFFFF",
              fontWeight: 600,
              cursor: form.title.trim() && form.date ? "pointer" : "default",
              transition: baseTransition,
            }}
          >
            {editingId ? "Save changes" : "Add event"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={startNew}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: COLORS.text,
                cursor: "pointer",
                transition: baseTransition,
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.25rem",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Upcoming
      </div>
      {sortedUpcoming.length === 0 ? (
        <p style={{ color: COLORS.textMuted }}>No upcoming events.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {sortedUpcoming.map((ev) => (
            <div
              key={ev.id}
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 16,
                border: `1px solid ${COLORS.border}`,
                transition: baseTransition,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: 6 }}>{ev.title}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: "0.85rem", marginBottom: 8 }}>
                    {formatDisplayDate(ev.date)} · <span style={{ color: COLORS.text }}>{daysRelativeLabel(ev.date)}</span>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: COLORS.primarySoft,
                      color: COLORS.primary,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    {ev.occasionType}
                  </span>
                  <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{ev.dressCode}</div>
                  {ev.location ? (
                    <div style={{ fontSize: "0.82rem", color: COLORS.textMuted, marginTop: 6 }}>📍 {ev.location}</div>
                  ) : null}
                  {ev.notes ? (
                    <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginTop: 8, lineHeight: 1.5 }}>{ev.notes}</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => startEdit(ev)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.surface,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      transition: baseTransition,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEvent(ev.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid rgba(232,160,160,0.35)`,
                      background: "transparent",
                      color: "#e8a0a0",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      transition: baseTransition,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPastOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          color: COLORS.text,
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "0.85rem",
          marginBottom: 12,
          transition: baseTransition,
        }}
      >
        <span>{pastOpen ? "▼" : "▶"}</span>
        Past events {sortedPast.length > 0 ? `(${sortedPast.length})` : ""}
      </button>
      {pastOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedPast.length === 0 ? (
            <p style={{ color: COLORS.textMuted, fontSize: "0.9rem" }}>No past events.</p>
          ) : (
            sortedPast.map((ev) => (
              <div
                key={ev.id}
                style={{
                  background: COLORS.surface2,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                  opacity: 0.92,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
                    <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>
                      {formatDisplayDate(ev.date)} · {daysRelativeLabel(ev.date)}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: COLORS.textMuted, marginTop: 6 }}>
                      {ev.occasionType} · {ev.dressCode}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(ev)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        transition: baseTransition,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent(ev.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid rgba(232,160,160,0.35)`,
                        background: "transparent",
                        color: "#e8a0a0",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        transition: baseTransition,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

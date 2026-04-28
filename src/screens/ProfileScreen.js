import React, { useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";

export function ProfileScreen({
  initial,
  onSave,
  baseTransition,
  defaultProfile,
  bodyTypesForGender,
  topSizesForGender,
  bottomSizesForGender,
  shoeSizesForGender,
  GENDER_OPTIONS,
  BUDGET_OPTIONS,
  STYLE_PREFS,
  BRANDS,
}) {
  const [form, setForm] = useState(() => ({ ...defaultProfile(), ...initial }));
  const [step, setStep] = useState(1);

  useEffect(() => {
    setForm({ ...defaultProfile(), ...initial });
  }, [defaultProfile, initial]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return Boolean(form.name && form.name.trim());
      case 2:
        return form.gender !== "";
      case 3:
        return Boolean(form.bodyType);
      case 4:
        return Boolean(form.budget);
      case 5:
        return form.styles.length > 0;
      case 6:
        return true;
      case 7:
        return Boolean(form.topSize && form.bottomSize && form.shoeSize);
      default:
        return false;
    }
  }, [step, form]);

  const editorBodyTypes = useMemo(() => bodyTypesForGender(form.gender), [bodyTypesForGender, form.gender]);
  const editorTopSizes = useMemo(() => topSizesForGender(form.gender), [topSizesForGender, form.gender]);
  const editorBottomSizes = useMemo(() => bottomSizesForGender(form.gender), [bottomSizesForGender, form.gender]);
  const editorShoeSizes = useMemo(() => shoeSizesForGender(form.gender), [shoeSizesForGender, form.gender]);

  const save = () => {
    onSave({ ...form });
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: n === step ? COLORS.primary : COLORS.surface2,
              transition: baseTransition,
            }}
            aria-label={`Section ${n}`}
          />
        ))}
      </div>

      <div
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          padding: 24,
          border: `1px solid ${COLORS.border}`,
          marginBottom: 20,
        }}
      >
        {step === 1 && (
          <>
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.8rem", marginBottom: 8 }}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface2,
                color: COLORS.text,
              }}
            />
          </>
        )}
        {step === 2 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {GENDER_OPTIONS.map((opt) => {
              const selected = form.gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      gender: opt.value,
                      bodyType: f.gender !== opt.value ? "" : f.bodyType,
                    }))
                  }
                  style={{
                    minHeight: 88,
                    padding: "20px 16px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: baseTransition,
                  }}
                >
                  <span style={{ fontSize: "1.75rem" }}>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {step === 3 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {editorBodyTypes.map((bt) => {
              const selected = form.bodyType === bt;
              return (
                <button
                  key={bt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, bodyType: bt }))}
                  style={{
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "0.88rem",
                    transition: baseTransition,
                  }}
                >
                  {bt}
                </button>
              );
            })}
          </div>
        )}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BUDGET_OPTIONS.map((b) => {
              const selected = form.budget === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, budget: b.id }))}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    transition: baseTransition,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{b.sub}</div>
                </button>
              );
            })}
          </div>
        )}
        {step === 5 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STYLE_PREFS.map((s) => {
              const on = form.styles.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      styles: on ? f.styles.filter((x) => x !== s) : [...f.styles, s],
                    }))
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    transition: baseTransition,
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        )}
        {step === 6 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BRANDS.map((b) => {
              const on = form.brands.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      brands: on ? f.brands.filter((x) => x !== b) : [...f.brands, b],
                    }))
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    transition: baseTransition,
                  }}
                >
                  {b}
                </button>
              );
            })}
          </div>
        )}
        {step === 7 && (
          <>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Top</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {editorTopSizes.map((sz) => {
                const selected = form.topSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, topSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Bottom</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {editorBottomSizes.map((sz) => {
                const selected = form.bottomSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, bottomSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Shoe (US)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {editorShoeSizes.map((sz) => {
                const selected = form.shoeSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, shoeSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: step === 1 ? COLORS.textMuted : COLORS.text,
              cursor: step === 1 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(7, s + 1))}
            disabled={!canAdvance || step === 7}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: !canAdvance || step === 7 ? COLORS.textMuted : COLORS.text,
              cursor: !canAdvance || step === 7 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            Next
          </button>
        </div>
        <button
          type="button"
          onClick={save}
          style={{
            padding: "12px 28px",
            borderRadius: 8,
            border: "none",
            background: COLORS.primary,
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: "pointer",
            transition: baseTransition,
          }}
        >
          Save profile
        </button>
      </div>
    </div>
  );
}

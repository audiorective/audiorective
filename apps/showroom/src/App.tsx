import type { CSSProperties } from "react";
import { examples } from "./examples/registry";

export function App() {
  return (
    <div style={styles.pickerRoot}>
      <header style={styles.pickerHeader}>
        <h1 style={styles.h1}>Audiorective Showroom</h1>
        <p style={styles.subtitle}>
          A gallery of example apps built on <code style={styles.code}>@audiorective/core</code> +{" "}
          <code style={styles.code}>@audiorective/react</code> + <code style={styles.code}>@audiorective/threejs</code>. Each example is its own page
          — fully isolated bundle, audio context, and lifecycle.
        </p>
      </header>
      <div style={styles.cardGrid}>
        {examples.map((ex) => (
          <a key={ex.id} href={ex.path} style={styles.card}>
            <div style={styles.cardTitle}>{ex.title}</div>
            <div style={styles.cardDesc}>{ex.description}</div>
            {ex.tags && ex.tags.length > 0 && (
              <div style={styles.tagRow}>
                {ex.tags.map((t) => (
                  <span key={t} style={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  pickerRoot: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#e0e0e0",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    padding: "48px 32px 64px",
    boxSizing: "border-box",
  },
  pickerHeader: {
    maxWidth: 1100,
    margin: "0 auto 36px",
    padding: "0 4px",
  },
  h1: {
    fontSize: "1.6rem",
    margin: "0 0 6px 0",
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  subtitle: {
    margin: 0,
    color: "#999",
    fontSize: 14,
    lineHeight: 1.55,
  },
  code: {
    background: "#161618",
    border: "1px solid #232327",
    borderRadius: 3,
    padding: "1px 5px",
    fontSize: "0.85em",
    color: "#cdd",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
    maxWidth: 1100,
    margin: "0 auto",
  },
  card: {
    display: "block",
    textDecoration: "none",
    textAlign: "left",
    padding: "18px 18px 16px",
    background: "#121214",
    border: "1px solid #1f1f24",
    borderRadius: 8,
    color: "#e0e0e0",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color 120ms, transform 120ms",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "#a0a0a8",
    marginBottom: 12,
  },
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    fontSize: 11,
    padding: "2px 8px",
    background: "#1c1c20",
    border: "1px solid #26262c",
    borderRadius: 999,
    color: "#9aa",
    letterSpacing: 0.2,
  },
};

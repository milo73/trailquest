type Tone = "terracotta" | "neutral" | "green" | "gold" | "navy";
const palette: Record<Tone, React.CSSProperties> = {
  terracotta: { background: "var(--tq-terracotta-tint-bg)", border: "1px solid var(--tq-terracotta-tint-border)", color: "var(--tq-terracotta-deep)" },
  neutral: { background: "var(--tq-paper)", border: "1px solid var(--tq-border)", color: "var(--tq-neutral-text)" },
  green: { background: "var(--tq-green-bg)", border: "1px solid var(--tq-green-border)", color: "var(--tq-green-ink)" },
  gold: { background: "var(--tq-gold-bg)", border: "1px solid var(--tq-gold-border)", color: "var(--tq-gold-ink)" },
  navy: { background: "var(--tq-navy)", border: "none", color: "var(--tq-white)" },
};
export function Chip({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 11px", font: "600 11px/1 var(--tq-sans)", ...palette[tone] }}>
      {children}
    </span>
  );
}

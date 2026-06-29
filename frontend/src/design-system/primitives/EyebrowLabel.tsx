export function EyebrowLabel({ children, color = "var(--tq-muted)" }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ font: "600 11px/1 var(--tq-mono)", color, letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--tq-paper)", border: "1px solid var(--tq-border)", borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

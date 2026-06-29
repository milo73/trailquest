export function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, padding: "13px 8px", textAlign: "center" }}>
      <div style={{ font: "400 22px/1 var(--tq-serif)", color: "var(--tq-ink)" }}>{value}</div>
      <div style={{ font: "500 10px/1 var(--tq-mono)", color: "var(--tq-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", background: "var(--tq-sand)", borderRadius: 11, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              border: "none",
              cursor: "pointer",
              padding: "8px 0",
              borderRadius: 8,
              font: active ? "600 13px/1 var(--tq-sans)" : "500 13px/1 var(--tq-sans)",
              background: active ? "var(--tq-terracotta)" : "transparent",
              color: active ? "var(--tq-white)" : "var(--tq-neutral-text)",
              boxShadow: active ? "0 2px 6px -2px rgba(150,58,48,.6)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--tq-terracotta)", color: "#fff", border: "none" },
  secondary: { background: "transparent", color: "var(--tq-navy)", border: "1px solid #cbbfa6" },
  ghost: { background: "transparent", color: "var(--tq-muted)", border: "none" },
};

export function Button({
  variant = "primary",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      style={{
        height: 52,
        borderRadius: 14,
        padding: "0 18px",
        font: "700 15px/1 var(--tq-sans)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...styles[variant],
        ...style,
      }}
    />
  );
}

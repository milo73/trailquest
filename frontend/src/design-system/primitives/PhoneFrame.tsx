import React from "react";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#1b1a17",
        padding: 10,
        borderRadius: 46,
        boxShadow:
          "0 30px 60px -22px rgba(33,31,27,.55),0 0 0 1px rgba(0,0,0,.35)",
        display: "inline-block",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 360,
          height: 764,
          background: "var(--tq-cream)",
          borderRadius: 36,
          overflow: "hidden",
          color: "#211f1b",
        }}
      >
        {/* Statusbalk */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            font: "600 13px/1 'DM Sans'",
            zIndex: 6,
          }}
        >
          <span>9:41</span>
          <span style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            {/* Signaalsterkte */}
            <svg width="17" height="11" viewBox="0 0 17 11">
              <rect x="0" y="7" width="3" height="4" rx="1" fill="#211f1b" />
              <rect x="4.5" y="5" width="3" height="6" rx="1" fill="#211f1b" />
              <rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="#211f1b" />
              <rect x="13.5" y="0" width="3" height="11" rx="1" fill="#211f1b" />
            </svg>
            {/* Batterij */}
            <svg width="24" height="12" viewBox="0 0 24 12">
              <rect
                x="0.5"
                y="1"
                width="20"
                height="10"
                rx="3"
                fill="none"
                stroke="#211f1b"
                strokeOpacity=".5"
              />
              <rect x="2.5" y="3" width="14" height="6" rx="1.5" fill="#211f1b" />
              <rect x="21.5" y="4" width="2" height="4" rx="1" fill="#211f1b" />
            </svg>
          </span>
        </div>
        {/* Scherminhoud */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

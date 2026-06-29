# TrailQuest Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TrailQuester player and Trail Creator studio as one Vite + React web app, wired to the existing FastAPI backend, faithful to the supplied mockups.

**Architecture:** Single Vite + React + TypeScript app under `frontend/`, route-split into `/play/*` (TrailQuester, mobile, in a phone frame) and `/studio/*` (Trail Creator, full-width web). A shared `design-system/` (tokens + primitives lifted from the mockups) and a typed `api/` layer talk to the backend. The player's core loop (generate → preview → navigate → answer/gate → finish) is fully wired; gamification (points/badges/rating) and the studio run client-side/mock behind typed seams.

**Tech Stack:** Vite, React 18, TypeScript, react-router-dom v6, Vitest, @testing-library/react, @testing-library/user-event, jsdom.

## Source-of-truth convention

The mockup file `/Users/milovandiest/Downloads/TrailQuest UI.dc.html` is the **authoritative markup** for every screen. Screen tasks reference it by line range ("port mockup lines A–B") and then specify the exact static→dynamic bindings and handlers to add. Copy the inline styles verbatim from those lines; they ARE the design. Logic and test code is given in full inline.

Mockup screen line ranges (verified):
- Configure (mobile): **28–112**
- Preview (mobile): **391–439**
- Navigate (mobile): **114–171**
- Stop / raadsel (mobile): **441–478**
- Finish / afronding (mobile): **480–524**
- Studio route-editor (web): **174–249**
- Studio stop-editor (web): **251–388**
- Studio dashboard (web): **526–609**
- Studio validation (web): **611–679**

## Global Constraints

- **Language:** all UI copy in **Dutch**, matching the mockups.
- **No backend changes.** The Python `pytest` suite must stay green and untouched.
- **Gating contract:** the client never re-derives gating or decides correctness. It reads `question.gates`, and `AnswerResult.unlocked_next` / `.revealed_answer` / `.feedback` from the backend (PRD §8). Generated content must never become a gate.
- **Backend base path:** backend mounts routes at root (`POST /trails`). The Vite dev proxy maps `/api/*` → `http://127.0.0.1:8000/*` (strips `/api`).
- **Attribution:** every displayed fact shows its `SourceBadge` (PRD §10).
- **Colors/fonts:** use the design tokens (Task 2); never hardcode hex outside `tokens.css`.
- **Tests:** Vitest + RTL. Run from `frontend/` with `npm test`.
- **Node:** assume Node ≥ 20.

---

### Task 1: Scaffold the Vite app + tooling

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/index.html`, `frontend/.env`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/vite-env.d.ts`, `frontend/src/setupTests.ts`, `frontend/.gitignore`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a booting app with React Router; `App` renders a redirect from `/` to `/play`. `npm test` and `npm run dev` work.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "trailquest-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create config files**

`frontend/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: true,
  },
});
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/.env`:
```
VITE_API_BASE=/api
```

`frontend/.gitignore`:
```
node_modules/
dist/
*.local
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrailQuest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create source entry files**

`frontend/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`frontend/src/setupTests.ts`:
```ts
import "@testing-library/jest-dom";
```

`frontend/src/App.tsx`:
```tsx
import { Navigate, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/play" replace />} />
      <Route path="/play/*" element={<div>TrailQuester</div>} />
      <Route path="/studio/*" element={<div>Trail Creator</div>} />
    </Routes>
  );
}
```

`frontend/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Write the failing test**

`frontend/src/App.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("renders the studio route", () => {
  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Trail Creator")).toBeInTheDocument();
});
```

- [ ] **Step 5: Install and run the test**

Run: `cd frontend && npm install && npm test`
Expected: 1 test passes. (If `npm install` is offline-blocked, note it and stop — the rest of the plan needs deps.)

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Vite + React + Router app"
```

---

### Task 2: Design tokens + core primitives

**Files:**
- Create: `frontend/src/design-system/tokens.css`, `frontend/src/design-system/fonts.ts`, `frontend/src/design-system/primitives/Button.tsx`, `Chip.tsx`, `Card.tsx`, `EyebrowLabel.tsx`, `StatTile.tsx`, `SourceBadge.tsx`, `frontend/src/design-system/primitives/index.ts`
- Test: `frontend/src/design-system/primitives/SourceBadge.test.tsx`, `Button.test.tsx`
- Modify: `frontend/src/main.tsx` (import `tokens.css` + fonts)

**Interfaces:**
- Produces:
  - `Button({ variant?: "primary" | "secondary" | "ghost", children, ...buttonProps })`
  - `Chip({ tone?: "terracotta" | "neutral" | "green" | "gold" | "navy", children })`
  - `Card({ children, style? })`
  - `EyebrowLabel({ children, color? })` — mono uppercase label
  - `StatTile({ value, label })`
  - `SourceBadge({ source })` where `source: { name: string }`; maps name→tone: Wikidata→green, Wikipedia→gold, OpenStreetMap/OSM→navy-blue. Renders the source name.

- [ ] **Step 1: Create `tokens.css`**

```css
:root {
  --tq-terracotta: #b5453a;
  --tq-terracotta-deep: #963a30;
  --tq-navy: #283a5e;
  --tq-ink: #211f1b;
  --tq-cream: #f3ede0;
  --tq-paper: #faf6ec;
  --tq-sand: #ece2cf;
  --tq-border: #e0d5bf;
  --tq-muted: #8a7f6d;
  --tq-green: #6f8a4f;
  --tq-green-bg: #e7eed7;
  --tq-green-ink: #3a5a2f;
  --tq-gold: #c5912f;
  --tq-gold-bg: #f8efda;
  --tq-gold-ink: #a3781f;
  --tq-osm-bg: #e3e8f1;
  --tq-osm-ink: #5a6a8a;
  --tq-serif: "DM Serif Display", Georgia, serif;
  --tq-sans: "DM Sans", system-ui, sans-serif;
  --tq-mono: "Spline Sans Mono", ui-monospace, monospace;
  --tq-display: "Bricolage Grotesque", var(--tq-sans);
  --tq-shadow-card: 0 40px 80px -34px rgba(33, 31, 27, 0.5), 0 0 0 1px rgba(40, 30, 20, 0.06);
  --tq-shadow-bezel: 0 30px 60px -22px rgba(33, 31, 27, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.35);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--tq-sans); color: var(--tq-ink); background: #f0eee9; }
@keyframes tqpulse { 0% { transform: scale(1); opacity: 0.55; } 70% { transform: scale(2.6); opacity: 0; } 100% { opacity: 0; } }
@keyframes tqdash { to { stroke-dashoffset: -28; } }
```

- [ ] **Step 2: Create `fonts.ts`**

```ts
// Injects the Google Fonts used by the mockups. Call once at app start.
export function loadFonts(): void {
  if (document.getElementById("tq-fonts")) return;
  const pre1 = document.createElement("link");
  pre1.rel = "preconnect";
  pre1.href = "https://fonts.googleapis.com";
  const pre2 = document.createElement("link");
  pre2.rel = "preconnect";
  pre2.href = "https://fonts.gstatic.com";
  pre2.crossOrigin = "anonymous";
  const link = document.createElement("link");
  link.id = "tq-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Spline+Sans+Mono:wght@400;500;600&display=swap";
  document.head.append(pre1, pre2, link);
}
```

- [ ] **Step 3: Write the failing tests**

`frontend/src/design-system/primitives/SourceBadge.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { SourceBadge } from "./SourceBadge";

test("renders the source name", () => {
  render(<SourceBadge source={{ name: "Wikidata" }} />);
  expect(screen.getByText("Wikidata")).toBeInTheDocument();
});

test("maps OSM to the osm tone class", () => {
  render(<SourceBadge source={{ name: "OpenStreetMap" }} />);
  expect(screen.getByText("OpenStreetMap")).toHaveAttribute("data-tone", "osm");
});
```

`frontend/src/design-system/primitives/Button.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

test("fires onClick", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Start</Button>);
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(onClick).toHaveBeenCalledOnce();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement the primitives**

`frontend/src/design-system/primitives/Button.tsx`:
```tsx
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
```

`frontend/src/design-system/primitives/SourceBadge.tsx`:
```tsx
type Tone = "wikidata" | "wikipedia" | "osm";

function toneFor(name: string): Tone {
  const n = name.toLowerCase();
  if (n.includes("wikidata")) return "wikidata";
  if (n.includes("wikipedia")) return "wikipedia";
  return "osm"; // OpenStreetMap / OSM / anything else
}

const palette: Record<Tone, React.CSSProperties> = {
  wikidata: { color: "var(--tq-green-ink)", background: "var(--tq-green-bg)", borderColor: "#cdd9b3" },
  wikipedia: { color: "#7d6a3f", background: "#f1e8d4", borderColor: "#ddccaa" },
  osm: { color: "var(--tq-osm-ink)", background: "var(--tq-osm-bg)", borderColor: "#c6cfdf" },
};

export function SourceBadge({ source }: { source: { name: string } }) {
  const tone = toneFor(source.name);
  return (
    <span
      data-tone={tone}
      style={{
        font: "600 10px/1 var(--tq-mono)",
        border: "1px solid",
        borderRadius: 5,
        padding: "4px 8px",
        ...palette[tone],
      }}
    >
      {source.name}
    </span>
  );
}
```

`frontend/src/design-system/primitives/Chip.tsx`:
```tsx
type Tone = "terracotta" | "neutral" | "green" | "gold" | "navy";
const palette: Record<Tone, React.CSSProperties> = {
  terracotta: { background: "#fbeee6", border: "1px solid #e8c3bb", color: "var(--tq-terracotta-deep)" },
  neutral: { background: "var(--tq-paper)", border: "1px solid var(--tq-border)", color: "#6b6256" },
  green: { background: "var(--tq-green-bg)", border: "1px solid #cdd9b3", color: "var(--tq-green-ink)" },
  gold: { background: "var(--tq-gold-bg)", border: "1px solid #e6cf9a", color: "var(--tq-gold-ink)" },
  navy: { background: "var(--tq-navy)", border: "none", color: "#fff" },
};
export function Chip({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 11px", font: "600 11px/1 var(--tq-sans)", ...palette[tone] }}>
      {children}
    </span>
  );
}
```

`frontend/src/design-system/primitives/Card.tsx`:
```tsx
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--tq-paper)", border: "1px solid var(--tq-border)", borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}
```

`frontend/src/design-system/primitives/EyebrowLabel.tsx`:
```tsx
export function EyebrowLabel({ children, color = "var(--tq-muted)" }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ font: "600 11px/1 var(--tq-mono)", color, letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}
```

`frontend/src/design-system/primitives/StatTile.tsx`:
```tsx
export function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, padding: "13px 8px", textAlign: "center" }}>
      <div style={{ font: "400 22px/1 var(--tq-serif)", color: "var(--tq-ink)" }}>{value}</div>
      <div style={{ font: "500 10px/1 var(--tq-mono)", color: "var(--tq-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
```

`frontend/src/design-system/primitives/index.ts`:
```ts
export { Button } from "./Button";
export { Chip } from "./Chip";
export { Card } from "./Card";
export { EyebrowLabel } from "./EyebrowLabel";
export { StatTile } from "./StatTile";
export { SourceBadge } from "./SourceBadge";
```

- [ ] **Step 6: Wire tokens + fonts into `main.tsx`**

Add to the top of `frontend/src/main.tsx` (after existing imports):
```tsx
import "./design-system/tokens.css";
import { loadFonts } from "./design-system/fonts";

loadFonts();
```

- [ ] **Step 7: Run tests**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): design tokens, fonts, core primitives"
```

---

### Task 3: PhoneFrame + SegmentedControl primitives

**Files:**
- Create: `frontend/src/design-system/primitives/PhoneFrame.tsx`, `SegmentedControl.tsx`
- Modify: `frontend/src/design-system/primitives/index.ts`
- Test: `frontend/src/design-system/primitives/SegmentedControl.test.tsx`

**Interfaces:**
- Produces:
  - `PhoneFrame({ children, scale? })` — `#1b1a17` bezel wrapping a 360×764 screen (the mockup phone). Renders a status bar ("9:41" + battery) at top; `children` fill the screen area.
  - `SegmentedControl({ options: {value,label}[], value, onChange })` — the GPS/Zoeken/Kaart and distance pills. Active = terracotta.

- [ ] **Step 1: Write the failing test**

`frontend/src/design-system/primitives/SegmentedControl.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./SegmentedControl";

test("selects an option and marks it active", async () => {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      value="gps"
      onChange={onChange}
      options={[
        { value: "gps", label: "GPS" },
        { value: "zoeken", label: "Zoeken" },
      ]}
    />,
  );
  expect(screen.getByText("GPS")).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByText("Zoeken"));
  expect(onChange).toHaveBeenCalledWith("zoeken");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test SegmentedControl`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/design-system/primitives/SegmentedControl.tsx`:
```tsx
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
              color: active ? "#fff" : "#6b6256",
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
```

`frontend/src/design-system/primitives/PhoneFrame.tsx` — port the bezel + status-bar markup from mockup **lines 30–38** (the `#1b1a17` padded wrapper, the 360×764 `#f3ede0` screen, and the status bar with "9:41" and the battery SVG). Make the inner screen `position: relative` and render `children` inside it below the status bar. Signature:
```tsx
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  // bezel + 9:41 status bar from mockup lines 30–38, then:
  // <div style={{ position:"absolute", top:40, left:0, right:0, bottom:0 }}>{children}</div>
}
```

Add both to `index.ts`:
```ts
export { PhoneFrame } from "./PhoneFrame";
export { SegmentedControl } from "./SegmentedControl";
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test SegmentedControl`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system
git commit -m "feat(frontend): PhoneFrame + SegmentedControl primitives"
```

---

### Task 4: MapCanvas primitive

**Files:**
- Create: `frontend/src/design-system/primitives/MapCanvas.tsx`
- Modify: `frontend/src/design-system/primitives/index.ts`
- Test: `frontend/src/design-system/primitives/MapCanvas.test.tsx`

**Interfaces:**
- Produces: `MapCanvas({ stops, activeOrder?, width?, height?, showUserDot? })` where `stops: { order: number; label: string }[]`. Renders the stylized SVG atlas: background, water/park shapes, road strokes, a dashed terracotta route polyline (class animates via `tqdash`), and a numbered pin per stop (start pin shows "S" / navy; the `activeOrder` pin is filled terracotta with a `tqpulse` ring). Pin positions: distribute stops along a deterministic looping path (a fixed set of normalized waypoints scaled to width/height; cycle if more stops than waypoints).

- [ ] **Step 1: Write the failing test**

`frontend/src/design-system/primitives/MapCanvas.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { MapCanvas } from "./MapCanvas";

test("renders one labelled pin per stop", () => {
  const { container } = render(
    <MapCanvas
      stops={[
        { order: 1, label: "S" },
        { order: 2, label: "2" },
        { order: 3, label: "3" },
      ]}
      activeOrder={2}
    />,
  );
  // each pin label is an SVG <text>
  const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
  expect(labels).toEqual(expect.arrayContaining(["S", "2", "3"]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test MapCanvas`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `MapCanvas.tsx`. Use the background/water/road/route markup from mockup **lines 119–135** (the navigate map) as the visual reference for shapes and stroke colors. Implementation outline (write it in full):
```tsx
const WAYPOINTS: [number, number][] = [
  [0.19, 0.74], [0.30, 0.55], [0.42, 0.40], [0.62, 0.33], [0.78, 0.47],
  [0.70, 0.66], [0.50, 0.72], [0.34, 0.66],
]; // normalized loop, lifted from the mockup route polylines

export function MapCanvas({
  stops,
  activeOrder,
  width = 360,
  height = 764,
  showUserDot = false,
}: {
  stops: { order: number; label: string }[];
  activeOrder?: number;
  width?: number;
  height?: number;
  showUserDot?: boolean;
}) {
  const pts = stops.map((s, i) => {
    const [nx, ny] = WAYPOINTS[i % WAYPOINTS.length];
    return { ...s, x: nx * width, y: ny * height };
  });
  const routeD = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%" }}>
      <rect width={width} height={height} fill="#e8dec9" />
      {/* road strokes — copy <g stroke="#dcd0b7"...> groups from mockup lines 123–124, scaled */}
      <path d={routeD} fill="none" stroke="#b5453a" strokeWidth={4.5} strokeLinecap="round"
            strokeLinejoin="round" strokeDasharray="2 11" style={{ animation: "tqdash 1.4s linear infinite" }} />
      {pts.map((p) => {
        const active = p.order === activeOrder;
        const isStart = p.label === "S";
        return (
          <g key={p.order}>
            {active && (
              <circle cx={p.x} cy={p.y} r={17} fill="#b5453a" opacity={0.4}
                      style={{ animation: "tqpulse 2.2s ease-out infinite", transformOrigin: `${p.x}px ${p.y}px` }} />
            )}
            <circle cx={p.x} cy={p.y} r={active ? 17 : 12}
                    fill={active || isStart ? (isStart ? "#283a5e" : "#b5453a") : "#fff"}
                    stroke={active || isStart ? "none" : "#b5453a"} strokeWidth={2.5} />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle"
                  fontFamily="DM Sans" fontWeight={700} fontSize={12}
                  fill={active || isStart ? "#fff" : "#283a5e"}>{p.label}</text>
          </g>
        );
      })}
      {showUserDot && pts[1] && (
        <circle cx={pts[1].x - 18} cy={pts[1].y + 40} r={7} fill="#283a5e" stroke="#fff" strokeWidth={3} />
      )}
    </svg>
  );
}
```
Then copy the two `<g stroke=...>` road-stroke groups from mockup lines 123–124 into the SVG (scaling the coordinates to the `width`/`height` is optional — the mockup uses a 360×764 viewBox which matches the default). Add to `index.ts`:
```ts
export { MapCanvas } from "./MapCanvas";
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test MapCanvas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system
git commit -m "feat(frontend): MapCanvas atlas SVG primitive"
```

---

### Task 5: API types + client + trail calls

**Files:**
- Create: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/trails.ts`
- Test: `frontend/src/api/trails.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Theme`, `SourceLicense`, `Source`, `Fact`, `QuestionType`, `Question`, `GeoPoint`, `POI`, `Stop`, `Trail`, `TrailRequest`, `AnswerRequest`, `AnswerResult` (exact mirror of `backend/app/models/schemas.py`).
  - `client.ts`: `class ApiError extends Error { status: number }`; `apiFetch<T>(path, init?): Promise<T>`.
  - `trails.ts`: `createTrail(req: TrailRequest): Promise<Trail>`; `getTrail(id: string): Promise<Trail>`; `submitAnswer(id: string, req: AnswerRequest): Promise<AnswerResult>`.

- [ ] **Step 1: Create `types.ts`**

```ts
export type Theme = "historical" | "hidden_gems" | "family" | "architecture" | "nature" | "mixed";
export type SourceLicense = "ODbL" | "CC0" | "CC-BY-SA";

export interface Source { name: string; license: SourceLicense; reference: string; }
export interface Fact { key: string; value: string; source: Source; }

export type QuestionType = "A" | "B" | "C" | "D";
export interface Question {
  type: QuestionType;
  prompt: string;
  answer?: string | null;
  hint?: string | null;
  gates: boolean;
}

export interface GeoPoint { lat: number; lon: number; }
export interface POI {
  id: string;
  name: string;
  location: GeoPoint;
  facts: Fact[];
  background?: string | null;
  background_source?: Source | null;
}
export interface Stop { order: number; poi: POI; story: string; question: Question; }
export interface Trail {
  id: string;
  city: string;
  theme: Theme;
  requested_distance_km: number;
  actual_distance_km: number;
  estimated_duration_min: number;
  start: GeoPoint;
  stops: Stop[];
  attributions: string[];
}

export interface TrailRequest { start: GeoPoint; distance_km: number; theme: Theme; }
export interface AnswerRequest { stop_order: number; answer: string; attempt: number; }
export interface AnswerResult {
  correct: boolean;
  unlocked_next: boolean;
  revealed_answer?: string | null;
  feedback: string;
}
```

- [ ] **Step 2: Create `client.ts`**

```ts
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 3: Create `trails.ts`**

```ts
import { apiFetch } from "./client";
import type { AnswerRequest, AnswerResult, Trail, TrailRequest } from "./types";

export const createTrail = (req: TrailRequest) =>
  apiFetch<Trail>("/trails", { method: "POST", body: JSON.stringify(req) });

export const getTrail = (id: string) => apiFetch<Trail>(`/trails/${id}`);

export const submitAnswer = (id: string, req: AnswerRequest) =>
  apiFetch<AnswerResult>(`/trails/${id}/answer`, { method: "POST", body: JSON.stringify(req) });
```

- [ ] **Step 4: Write the failing test**

`frontend/src/api/trails.test.ts`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { createTrail, submitAnswer } from "./trails";
import { ApiError } from "./client";

afterEach(() => vi.restoreAllMocks());

test("createTrail POSTs the request and returns the trail", async () => {
  const trail = { id: "t1", stops: [] };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(trail), { status: 201, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await createTrail({ start: { lat: 52.38, lon: 4.63 }, distance_km: 5, theme: "historical" });

  expect(result).toEqual(trail);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/trails");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ start: { lat: 52.38, lon: 4.63 }, distance_km: 5, theme: "historical" });
});

test("throws ApiError with detail on non-2xx", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not enough POIs" }), { status: 422 }),
    ),
  );
  await expect(submitAnswer("t1", { stop_order: 1, answer: "x", attempt: 1 })).rejects.toMatchObject({
    name: "ApiError",
    status: 422,
    message: "Not enough POIs",
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npm test trails`
Expected: PASS (with `VITE_API_BASE=/api` default; the `.env` sets it).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): typed API layer (types, client, trail calls)"
```

---

### Task 6: Gamification logic (points + badges)

**Files:**
- Create: `frontend/src/quester/gamification.ts`
- Test: `frontend/src/quester/gamification.test.ts`

**Interfaces:**
- Produces:
  - `pointsFor({ correct, attempt, usedHint }): number` — mirrors backend `gamification_service.points_for` exactly (10 base, +5 if attempt===1, +3 if !usedHint, 0 if !correct).
  - `SolveRecord = { type: QuestionType; correct: boolean; attempt: number; usedHint: boolean }`
  - `Badge = { id: string; label: string }`
  - `deriveBadges(trail: Trail, solves: SolveRecord[]): Badge[]`

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/gamification.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { deriveBadges, pointsFor } from "./gamification";
import type { Trail } from "../api/types";

describe("pointsFor", () => {
  test("first try, no hint = 18", () => {
    expect(pointsFor({ correct: true, attempt: 1, usedHint: false })).toBe(18);
  });
  test("later attempt with hint = 10", () => {
    expect(pointsFor({ correct: true, attempt: 2, usedHint: true })).toBe(10);
  });
  test("incorrect / revealed = 0", () => {
    expect(pointsFor({ correct: false, attempt: 3, usedHint: false })).toBe(0);
  });
});

const trail = (theme: Trail["theme"]): Trail => ({
  id: "t", city: "Haarlem", theme, requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 0, lon: 0 }, stops: [], attributions: [],
});

describe("deriveBadges", () => {
  test("historical theme yields Historicus + Stadskenner", () => {
    const badges = deriveBadges(trail("historical"), [
      { type: "A", correct: true, attempt: 2, usedHint: true },
    ]).map((b) => b.id);
    expect(badges).toContain("historicus");
    expect(badges).toContain("stadskenner");
    expect(badges).not.toContain("speurneus");
  });
  test("a perfect solve yields Speurneus", () => {
    const badges = deriveBadges(trail("mixed"), [
      { type: "A", correct: true, attempt: 1, usedHint: false },
    ]).map((b) => b.id);
    expect(badges).toContain("speurneus");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test gamification`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/quester/gamification.ts`:
```ts
import type { QuestionType, Theme, Trail } from "../api/types";

export const BASE_POINTS = 10;
export const FIRST_TRY_BONUS = 5;
export const NO_HINT_BONUS = 3;

export function pointsFor({
  correct,
  attempt,
  usedHint,
}: {
  correct: boolean;
  attempt: number;
  usedHint: boolean;
}): number {
  if (!correct) return 0;
  let p = BASE_POINTS;
  if (attempt === 1) p += FIRST_TRY_BONUS;
  if (!usedHint) p += NO_HINT_BONUS;
  return p;
}

export interface SolveRecord {
  type: QuestionType;
  correct: boolean;
  attempt: number;
  usedHint: boolean;
}

export interface Badge {
  id: string;
  label: string;
}

const THEME_BADGE: Partial<Record<Theme, Badge>> = {
  historical: { id: "historicus", label: "Historicus" },
  architecture: { id: "bouwmeester", label: "Bouwmeester" },
  nature: { id: "natuurkenner", label: "Natuurkenner" },
  hidden_gems: { id: "speurder", label: "Speurder" },
  family: { id: "gezinsheld", label: "Gezinsheld" },
};

export function deriveBadges(trail: Trail, solves: SolveRecord[]): Badge[] {
  const badges: Badge[] = [{ id: "stadskenner", label: "Stadskenner" }];
  const themeBadge = THEME_BADGE[trail.theme];
  if (themeBadge) badges.push(themeBadge);
  if (solves.some((s) => s.correct && s.attempt === 1 && !s.usedHint)) {
    badges.push({ id: "speurneus", label: "Speurneus" });
  }
  return badges;
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test gamification`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/gamification.ts frontend/src/quester/gamification.test.ts
git commit -m "feat(frontend): client-side points + badge derivation"
```

---

### Task 7: Quester flow store (state machine + persistence)

**Files:**
- Create: `frontend/src/quester/store.tsx`
- Test: `frontend/src/quester/store.test.tsx`

**Interfaces:**
- Produces a React context store:
  - `Phase = "configure" | "preview" | "navigate" | "stop" | "finish"`
  - `QuesterState = { phase; config: TrailRequest; trail?: Trail; currentOrder: number; solves: Record<number, SolveRecord>; points: number }`
  - `QuesterProvider({ children })` — wraps the flow, restores from `localStorage` key `tq.quester`, persists on change.
  - `useQuester()` → `{ state; setConfig; startGenerating; setTrail; goToStop; recordSolve; arriveAtNextOrFinish; reset }`
    - `setConfig(partial: Partial<TrailRequest>)`
    - `setTrail(trail: Trail)` → sets `phase="preview"`, `currentOrder = first stop order`
    - `goToStop(order)` → `phase="stop"`, `currentOrder=order`
    - `recordSolve(order, record: SolveRecord)` → adds points via `pointsFor`, stores record
    - `arriveAtNextOrFinish()` → advance `currentOrder` to next stop (`phase="navigate"`) or `phase="finish"` if last
    - `reset()` → back to `configure`, clears state + storage
  - Default config: `{ start: { lat: 52.3812, lon: 4.6361 }, distance_km: 5, theme: "historical" }` (Haarlem centre).

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/store.test.tsx`:
```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { QuesterProvider, useQuester } from "./store";
import type { Trail } from "../api/types";

const wrapper = ({ children }: { children: React.ReactNode }) => <QuesterProvider>{children}</QuesterProvider>;

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 105, start: { lat: 52.38, lon: 4.63 },
  attributions: [],
  stops: [
    { order: 1, poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", question: { type: "C", prompt: "?", gates: false } },
    { order: 2, poi: { id: "p2", name: "Stadhuis", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", question: { type: "A", prompt: "?", answer: "78", gates: true } },
  ],
};

beforeEach(() => localStorage.clear());

test("setTrail moves to preview at the first stop", () => {
  const { result } = renderHook(() => useQuester(), { wrapper });
  act(() => result.current.setTrail(trail));
  expect(result.current.state.phase).toBe("preview");
  expect(result.current.state.currentOrder).toBe(1);
});

test("recordSolve adds points; arrive advances then finishes", () => {
  const { result } = renderHook(() => useQuester(), { wrapper });
  act(() => result.current.setTrail(trail));
  act(() => result.current.goToStop(1));
  act(() => result.current.recordSolve(1, { type: "C", correct: true, attempt: 1, usedHint: false }));
  expect(result.current.state.points).toBe(18);
  act(() => result.current.arriveAtNextOrFinish()); // -> navigate to stop 2
  expect(result.current.state.phase).toBe("navigate");
  expect(result.current.state.currentOrder).toBe(2);
  act(() => result.current.goToStop(2));
  act(() => result.current.arriveAtNextOrFinish()); // last -> finish
  expect(result.current.state.phase).toBe("finish");
});

test("persists across remount", () => {
  const first = renderHook(() => useQuester(), { wrapper });
  act(() => first.result.current.setTrail(trail));
  const second = renderHook(() => useQuester(), { wrapper });
  expect(second.result.current.state.trail?.id).toBe("t1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `store.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Trail, TrailRequest } from "../api/types";
import { pointsFor, type SolveRecord } from "./gamification";

export type Phase = "configure" | "preview" | "navigate" | "stop" | "finish";

export interface QuesterState {
  phase: Phase;
  config: TrailRequest;
  trail?: Trail;
  currentOrder: number;
  solves: Record<number, SolveRecord>;
  points: number;
}

const STORAGE_KEY = "tq.quester";
const DEFAULT_STATE: QuesterState = {
  phase: "configure",
  config: { start: { lat: 52.3812, lon: 4.6361 }, distance_km: 5, theme: "historical" },
  currentOrder: 1,
  solves: {},
  points: 0,
};

function load(): QuesterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...(JSON.parse(raw) as QuesterState) };
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_STATE;
}

interface QuesterApi {
  state: QuesterState;
  setConfig: (partial: Partial<TrailRequest>) => void;
  setTrail: (trail: Trail) => void;
  goToStop: (order: number) => void;
  recordSolve: (order: number, record: SolveRecord) => void;
  arriveAtNextOrFinish: () => void;
  reset: () => void;
}

const Ctx = createContext<QuesterApi | null>(null);

export function QuesterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuesterState>(load);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const api = useMemo<QuesterApi>(() => {
    const orders = () => (state.trail?.stops.map((s) => s.order) ?? []);
    return {
      state,
      setConfig: (partial) => setState((s) => ({ ...s, config: { ...s.config, ...partial } })),
      setTrail: (trail) =>
        setState((s) => ({ ...s, trail, phase: "preview", currentOrder: trail.stops[0]?.order ?? 1, solves: {}, points: 0 })),
      goToStop: (order) => setState((s) => ({ ...s, phase: "stop", currentOrder: order })),
      recordSolve: (order, record) =>
        setState((s) => ({
          ...s,
          solves: { ...s.solves, [order]: record },
          points: s.points + pointsFor(record),
        })),
      arriveAtNextOrFinish: () =>
        setState((s) => {
          const all = s.trail?.stops.map((st) => st.order) ?? [];
          const idx = all.indexOf(s.currentOrder);
          const next = all[idx + 1];
          return next === undefined
            ? { ...s, phase: "finish" }
            : { ...s, phase: "navigate", currentOrder: next };
        }),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState({ ...DEFAULT_STATE });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useQuester(): QuesterApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuester must be used within QuesterProvider");
  return ctx;
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/store.tsx frontend/src/quester/store.test.tsx
git commit -m "feat(frontend): quester flow store with persistence"
```

---

### Task 8: Configure screen

**Files:**
- Create: `frontend/src/quester/screens/Configure.tsx`
- Test: `frontend/src/quester/screens/Configure.test.tsx`

**Interfaces:**
- Consumes: `useQuester()` (`state.config`, `setConfig`, `setTrail`), `createTrail`, `SegmentedControl`, `Button`, `EyebrowLabel`, `Chip`, `PhoneFrame`.
- Produces: `Configure()` — renders inside `PhoneFrame`. Port the layout from mockup **lines 39–109**. Bindings:
  - Location segmented control: options GPS/Zoeken/Kaart (local state; GPS is the working path). On "GPS" pressed, call `navigator.geolocation.getCurrentPosition` and `setConfig({ start })`; on failure keep the default and show "Grote Markt 2 · Huidige locatie".
  - Distance buttons (2/5/10/15) → `setConfig({ distance_km })`; active = the matching value.
  - Theme grid (6 cards, mockup lines 75–100) → `setConfig({ theme })`; map labels to theme values: Historisch→historical, Verborgen parels→hidden_gems, Familie→family, Architectuur→architecture, Natuur→nature, Gemengd→mixed.
  - "Genereer speurtocht" button → set a `generating` state, call `createTrail(state.config)`, then `setTrail(trail)`. On `ApiError`, show the error text in place of the footer hint.

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/screens/Configure.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Configure } from "./Configure";

afterEach(() => vi.restoreAllMocks());

function Harness() {
  const { state } = useQuester();
  return (
    <>
      <Configure />
      <output data-testid="phase">{state.phase}</output>
      <output data-testid="theme">{state.config.theme}</output>
    </>
  );
}

test("selecting a theme updates config and generating moves to preview", async () => {
  const trail = { id: "t1", stops: [{ order: 1 }] };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(trail), { status: 201 })),
  );
  render(
    <QuesterProvider>
      <Harness />
    </QuesterProvider>,
  );
  await userEvent.click(screen.getByText("Natuur"));
  expect(screen.getByTestId("theme")).toHaveTextContent("nature");
  await userEvent.click(screen.getByRole("button", { name: /Genereer speurtocht/i }));
  await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("preview"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Configure`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Configure.tsx`**

Port mockup lines 39–109 markup, replacing the static GPS/distance/theme/active styles with state-driven values per the Interfaces bindings above, and wiring the generate button to `createTrail` → `setTrail`. Theme cards: keep the SVG icons from the mockup; toggle the active border/background (mockup line 76 = active style, line 80 = inactive style) based on `state.config.theme`.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test Configure`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/screens/Configure.tsx frontend/src/quester/screens/Configure.test.tsx
git commit -m "feat(frontend): Configure screen"
```

---

### Task 9: Preview screen

**Files:**
- Create: `frontend/src/quester/screens/Preview.tsx`
- Test: `frontend/src/quester/screens/Preview.test.tsx`

**Interfaces:**
- Consumes: `useQuester()` (`state.trail`, `goToStop`, `setTrail`), `createTrail`, `MapCanvas`, `StatTile`, `Button`, `Chip`, `EyebrowLabel`, `PhoneFrame`.
- Produces: `Preview()` — port mockup **lines 396–437**. Bindings:
  - Top map: `MapCanvas` with `stops` from `state.trail.stops` (label = order, first = "S"), `height={270}`.
  - Title block: trail theme chip + a Dutch title derived from theme (e.g. historical → "Langs de Gouden Eeuw"); keep "JE SPEURTOCHT IS KLAAR" eyebrow.
  - Stat tiles: `actual_distance_km` (comma decimal), `estimated_duration_min` formatted `1u45`, `stops.length`.
  - "Wat je gaat ontdekken" list: first two stops named, then "+ N verrassingen onderweg" where N = `stops.length - 2`.
  - "Start speurtocht" → `goToStop(firstOrder)`. "Opnieuw genereren" → `createTrail(state.config)` then `setTrail`.

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/screens/Preview.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Preview } from "./Preview";
import type { Trail } from "../../api/types";

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 105, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [1, 2, 3, 4].map((order) => ({
    order, story: "s", question: { type: "C" as const, prompt: "?", gates: false },
    poi: { id: `p${order}`, name: `POI ${order}`, location: { lat: 52.38, lon: 4.63 }, facts: [] },
  })),
};

function Harness() {
  const { state, setTrail } = useQuester();
  return (
    <>
      <button onClick={() => setTrail(trail)}>seed</button>
      {state.trail && <Preview />}
      <output data-testid="phase">{state.phase}</output>
    </>
  );
}

test("shows stats and starts the trail", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("5,2")).toBeInTheDocument();
  expect(screen.getByText(/2 verrassingen onderweg/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Start speurtocht/i }));
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Preview`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per Interfaces, porting mockup lines 396–437.

Add a small helper for the theme title and `formatKm`/`formatDuration` (comma decimals, `1u45`). Keep these in the file.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test Preview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/screens/Preview.tsx frontend/src/quester/screens/Preview.test.tsx
git commit -m "feat(frontend): Preview screen"
```

---

### Task 10: Navigate screen

**Files:**
- Create: `frontend/src/quester/screens/Navigate.tsx`
- Test: `frontend/src/quester/screens/Navigate.test.tsx`

**Interfaces:**
- Consumes: `useQuester()` (`state.trail`, `state.currentOrder`, `state.points`, `goToStop`), `MapCanvas`, `Button`, `EyebrowLabel`, `PhoneFrame`.
- Produces: `Navigate()` — port mockup **lines 118–169**. Bindings:
  - `MapCanvas` full-screen with `activeOrder={state.currentOrder}`, `showUserDot`.
  - Progress header: "Stop {currentIndex+1} van {stops.length}" and the segment bar (filled up to currentIndex).
  - Next-stop card: name = current stop's POI name; subtitle from first fact or POI; distance "280 m" / "~4 min" can be static placeholders (no live geo). Points pill = `state.points`.
  - "Ik ben er" button → `goToStop(state.currentOrder)`.

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/screens/Navigate.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Navigate } from "./Navigate";
import type { Trail } from "../../api/types";

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [
    { order: 1, story: "s", question: { type: "C", prompt: "?", gates: false }, poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] } },
    { order: 2, story: "s", question: { type: "A", prompt: "?", answer: "78", gates: true }, poi: { id: "p2", name: "Sint-Bavokerk", location: { lat: 52.38, lon: 4.63 }, facts: [] } },
  ],
};

function Harness() {
  const { state, setTrail, arriveAtNextOrFinish } = useQuester();
  return (
    <>
      <button onClick={() => { setTrail(trail); arriveAtNextOrFinish(); }}>seed</button>
      {state.phase === "navigate" && <Navigate />}
      <output data-testid="phase">{state.phase}</output>
    </>
  );
}

test("shows the next stop and the 'Ik ben er' button arrives", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("Sint-Bavokerk")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Ik ben er/i }));
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Navigate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per Interfaces, porting mockup lines 118–169.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test Navigate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/screens/Navigate.tsx frontend/src/quester/screens/Navigate.test.tsx
git commit -m "feat(frontend): Navigate screen"
```

---

### Task 11: Stop screen (story + question + gating)

**Files:**
- Create: `frontend/src/quester/screens/Stop.tsx`
- Test: `frontend/src/quester/screens/Stop.test.tsx`

**Interfaces:**
- Consumes: `useQuester()` (`state.trail`, `state.currentOrder`, `recordSolve`, `arriveAtNextOrFinish`), `submitAnswer`, `SourceBadge`, `Button`, `EyebrowLabel`, `PhoneFrame`.
- Produces: `Stop()` — port mockup **lines 446–476**. Behavior (the gating heart — driven entirely by `AnswerResult`):
  - Current stop = `state.trail.stops.find(s => s.order === currentOrder)`.
  - Render story; render a `SourceBadge` per distinct fact source in `stop.poi.facts`.
  - Question prompt + answer input + submit. Local state: `attempt` (start 1), `usedHint` (false), `feedback`, `done`.
  - On submit: call `submitAnswer(trail.id, { stop_order, answer, attempt })`. Show `result.feedback`.
    - If `result.unlocked_next`: call `recordSolve(order, { type: question.type, correct: result.correct, attempt, usedHint })`, set `done=true`, reveal `result.revealed_answer` if present, and show a "Volgende" button → `arriveAtNextOrFinish()`.
    - Else (`!unlocked_next`): increment `attempt`; the input stays. (Backend already returns the hint in `feedback` on attempt 1.)
  - "Hint gebruiken" button → set `usedHint=true` and show `question.hint` (also re-shown by backend feedback). "poging N van 3" reflects `attempt`.
  - "Klopt dit feit niet?" button → local acknowledgement only (toggle a small "Bedankt voor je melding" note).

- [ ] **Step 1: Write the failing tests**

`frontend/src/quester/screens/Stop.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Stop } from "./Stop";
import type { Trail } from "../../api/types";

afterEach(() => vi.restoreAllMocks());

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [{
    order: 1, story: "Kijk omhoog.",
    question: { type: "A", prompt: "Hoe hoog is de toren?", answer: "78 meter", hint: "13 x 6", gates: true },
    poi: { id: "p1", name: "Sint-Bavokerk", location: { lat: 52.38, lon: 4.63 },
      facts: [{ key: "height_m", value: "78", source: { name: "Wikidata", license: "CC0", reference: "wikidata:Q1" } }] },
  }],
};

function Harness() {
  const { state, setTrail, goToStop } = useQuester();
  return (
    <>
      <button onClick={() => { setTrail(trail); goToStop(1); }}>seed</button>
      {state.phase === "stop" && <Stop />}
      <output data-testid="phase">{state.phase}</output>
      <output data-testid="points">{state.points}</output>
    </>
  );
}

function mockAnswer(result: object) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 })));
}

test("correct gating answer unlocks next and scores points", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("Wikidata")).toBeInTheDocument(); // source badge
  mockAnswer({ correct: true, unlocked_next: true, feedback: "Correct!" });
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "78 meter");
  await userEvent.click(screen.getByRole("button", { name: "" })); // submit arrow button; see note
  expect(await screen.findByText("Correct!")).toBeInTheDocument();
  expect(screen.getByTestId("points")).toHaveTextContent("18");
  await userEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  expect(screen.getByTestId("phase")).not.toHaveTextContent("stop");
});

test("wrong answer keeps the stop locked", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  mockAnswer({ correct: false, unlocked_next: false, feedback: "Niet quite. Hint: 13 x 6" });
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "10");
  await userEvent.click(screen.getByLabelText("Antwoord versturen"));
  expect(await screen.findByText(/Hint: 13 x 6/)).toBeInTheDocument();
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
```

> Note for the implementer: give the submit button `aria-label="Antwoord versturen"` so the test can target it (the mockup's submit is an icon-only button). Update the first test's submit click to `screen.getByLabelText("Antwoord versturen")` as well.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Stop`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Stop.tsx`** per Interfaces, porting mockup lines 446–476. Give the submit button `aria-label="Antwoord versturen"`. Drive all gating purely off the `AnswerResult` fields; never compare the answer locally.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test Stop`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/quester/screens/Stop.tsx frontend/src/quester/screens/Stop.test.tsx
git commit -m "feat(frontend): Stop screen with backend-driven gating"
```

---

### Task 12: Finish screen + QuesterApp wiring

**Files:**
- Create: `frontend/src/quester/screens/Finish.tsx`, `frontend/src/quester/QuesterApp.tsx`
- Modify: `frontend/src/App.tsx` (mount `QuesterApp` at `/play/*`)
- Test: `frontend/src/quester/QuesterApp.test.tsx`

**Interfaces:**
- Consumes: `useQuester()`, `deriveBadges`, `StatTile`, `Button`, `EyebrowLabel`, `PhoneFrame`, all five screens.
- Produces:
  - `Finish()` — port mockup **lines 484–522**. Bindings: total `state.points`; badges from `deriveBadges(state.trail, Object.values(state.solves))`; walked stats from `state.trail`; star rating = local state (1–5), no network; "Nieuwe tocht" → `reset()`.
  - `QuesterApp()` — wraps everything in `QuesterProvider` and renders the screen for `state.phase` (configure→Configure, preview→Preview, navigate→Navigate, stop→Stop, finish→Finish).

- [ ] **Step 1: Write the failing test**

`frontend/src/quester/QuesterApp.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import QuesterApp from "./QuesterApp";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

test("end-to-end: generate a one-stop trail and finish it", async () => {
  const trail = {
    id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
    estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
    stops: [{ order: 1, story: "s", question: { type: "C", prompt: "Wat denk je?", gates: false },
      poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] } }],
  };
  const fetchMock = vi.fn((url: string) =>
    url.endsWith("/answer")
      ? Promise.resolve(new Response(JSON.stringify({ correct: true, unlocked_next: true, feedback: "Mooi." }), { status: 200 }))
      : Promise.resolve(new Response(JSON.stringify(trail), { status: 201 })),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter initialEntries={["/play"]}><QuesterApp /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: /Genereer speurtocht/i }));
  await userEvent.click(await screen.findByRole("button", { name: /Start speurtocht/i }));
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "iets");
  await userEvent.click(screen.getByLabelText("Antwoord versturen"));
  await userEvent.click(await screen.findByRole("button", { name: /Volgende/i }));
  await waitFor(() => expect(screen.getByText(/Goed gedaan/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test QuesterApp`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Finish.tsx` and `QuesterApp.tsx`**

`QuesterApp.tsx`:
```tsx
import { QuesterProvider, useQuester } from "./store";
import { Configure } from "./screens/Configure";
import { Preview } from "./screens/Preview";
import { Navigate } from "./screens/Navigate";
import { Stop } from "./screens/Stop";
import { Finish } from "./screens/Finish";

function Flow() {
  const { state } = useQuester();
  switch (state.phase) {
    case "preview": return <Preview />;
    case "navigate": return <Navigate />;
    case "stop": return <Stop />;
    case "finish": return <Finish />;
    default: return <Configure />;
  }
}

export default function QuesterApp() {
  return (
    <QuesterProvider>
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f0eee9" }}>
        <Flow />
      </div>
    </QuesterProvider>
  );
}
```

Then port `Finish.tsx` from mockup lines 484–522 per the Interfaces bindings.

Modify `App.tsx`:
```tsx
import { Navigate as RouterNavigate, Route, Routes } from "react-router-dom";
import QuesterApp from "./quester/QuesterApp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RouterNavigate to="/play" replace />} />
      <Route path="/play/*" element={<QuesterApp />} />
      <Route path="/studio/*" element={<div>Trail Creator</div>} />
    </Routes>
  );
}
```
(Keep the existing `App.test.tsx` passing — the `/studio` placeholder stays until Task 13.)

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): Finish screen + QuesterApp flow wiring"
```

---

### Task 13: Studio mock data + StudioApp shell + Dashboard

**Files:**
- Create: `frontend/src/studio/mock/trails.ts`, `frontend/src/studio/StudioApp.tsx`, `frontend/src/studio/StudioChrome.tsx`, `frontend/src/studio/screens/Dashboard.tsx`
- Modify: `frontend/src/App.tsx` (mount `StudioApp` at `/studio/*`)
- Test: `frontend/src/studio/screens/Dashboard.test.tsx`

**Interfaces:**
- Produces:
  - `mock/trails.ts`: `StudioTrailCard = { id; title; theme; status: "concept" | "live" | "review"; distanceKm; stops; plays?; completion?; rating?; warnings? }` and `MOCK_TRAILS: StudioTrailCard[]` (the 4 cards from mockup lines 564–599: Haarlems Gouden Eeuw/concept, Verborgen hofjes/live, Spaarne & molens/review, Kinderspeurtocht/live) plus `MOCK_DASHBOARD_STATS = { trails: 5, plays: 1240, rating: 4.5, correctness: 99 }`.
  - `StudioChrome({ breadcrumb, actions, children })`: the browser-chrome + top-nav frame shared by all studio screens (port from mockup lines 530–546).
  - `Dashboard()`: stat tiles + trail-card grid + "Nieuwe tocht maken" card. "Nieuwe tocht" / card click → `useNavigate()` to `/studio/route`.
  - `StudioApp()`: routes `/studio` → Dashboard, `/studio/route` → RouteEditor (Task 14), `/studio/stop` → StopEditor (Task 15), `/studio/validate` → Validation (Task 16). Until those exist, route them to Dashboard.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/screens/Dashboard.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";

test("renders the trail cards and stats", () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText("Haarlems Gouden Eeuw")).toBeInTheDocument();
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument();
  expect(screen.getByText("1.240")).toBeInTheDocument(); // keer gespeeld
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Dashboard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** mock data, `StudioChrome`, `Dashboard`, `StudioApp`, and wire `App.tsx`'s `/studio/*` to `<StudioApp />`. Port dashboard markup from mockup lines 547–606 and chrome from 530–546.

`App.tsx` `/studio` route becomes:
```tsx
import StudioApp from "./studio/StudioApp";
// ...
<Route path="/studio/*" element={<StudioApp />} />
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test`
Expected: all pass (including the earlier `App.test.tsx`, now rendering real Dashboard text "Trail Creator" — update that assertion to `screen.getByText("Haarlems Gouden Eeuw")` since the placeholder is gone).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): studio shell, mock data, Dashboard"
```

---

### Task 14: Studio RouteEditor

**Files:**
- Create: `frontend/src/studio/screens/RouteEditor.tsx`
- Test: `frontend/src/studio/screens/RouteEditor.test.tsx`

**Interfaces:**
- Consumes: `StudioChrome`, `MapCanvas`, `Button`, `Chip`, `createTrail`, `useNavigate`.
- Produces: `RouteEditor()` — port mockup **lines 192–247**. Local state = an editable stop list (seed from a mock trail constant `MOCK_ROUTE_STOPS` defined in the file: Grote Markt/start, Stadhuis, Vleeshal, Sint-Bavokerk, Hofje van Bakenes, Molen De Adriaan [flagged "geen feiten"]). Behaviors:
  - Render the left stop list with reorder (move up/down buttons — drag is out of scope; provide ▲/▼ buttons with `aria-label`) and a remove (×) per stop; "+ Stop toevoegen" appends a placeholder stop.
  - `MapCanvas` center with `stops` mirroring the list, `activeOrder` = the selected stop.
  - Distance meter + "binnen tolerantie ±15%" chip (static from the mock total).
  - A "Genereer concept" button (top, near "Voorvertoning") → `createTrail({ start: {lat:52.3812,lon:4.6361}, distance_km:5, theme:"historical" })`, then replace the list with the returned trail's stops (names from `poi.name`). On error, leave the list unchanged.
  - Clicking a stop row → `navigate("/studio/stop")`.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/screens/RouteEditor.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RouteEditor } from "./RouteEditor";

test("reorders stops with the move-down control", async () => {
  render(<MemoryRouter><RouteEditor /></MemoryRouter>);
  const list = screen.getByRole("list", { name: /stops/i });
  const firstBefore = within(list).getAllByRole("listitem")[0];
  expect(firstBefore).toHaveTextContent("Grote Markt");
  // move "Stadhuis" (item 2) up so order changes
  await userEvent.click(screen.getByLabelText("Stadhuis omhoog"));
  const items = within(list).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Stadhuis");
});

test("adds a stop", async () => {
  render(<MemoryRouter><RouteEditor /></MemoryRouter>);
  const before = screen.getAllByRole("listitem").length;
  await userEvent.click(screen.getByRole("button", { name: /Stop toevoegen/i }));
  expect(screen.getAllByRole("listitem").length).toBe(before + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test RouteEditor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per Interfaces. Use a `<ul role="list" aria-label="Stops">` with `<li>` rows (mockup rows lines 205–210). Each non-start row gets `aria-label="{name} omhoog"` / `"{name} omlaag"` move buttons.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test RouteEditor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/RouteEditor.tsx frontend/src/studio/screens/RouteEditor.test.tsx
git commit -m "feat(frontend): studio RouteEditor"
```

---

### Task 15: Studio StopEditor (feiten vs verhaal + gating rule made visible)

**Files:**
- Create: `frontend/src/studio/screens/StopEditor.tsx`, `frontend/src/studio/mock/stop.ts`
- Test: `frontend/src/studio/screens/StopEditor.test.tsx`

**Interfaces:**
- Consumes: `StudioChrome`, `SourceBadge`, `Button`, `Chip`, `PhoneFrame`, `MapCanvas`.
- Produces:
  - `mock/stop.ts`: `MOCK_STOP` — a `Stop`-shaped object for Sint-Bavokerk with 3–4 facts (Wikidata/Wikipedia/OSM sources) and a Type-A question with `answer:"78 meter"` (from mockup lines 298–365).
  - `StopEditor()` — port mockup **lines 267–386**. Three zones:
    - **Feiten (locked):** list facts with `SourceBadge`; each has a checkbox to include/exclude (local state); facts are NOT text-editable.
    - **Verhaal (editable):** a `<textarea>` seeded with the mock story; "AI-gegenereerd" tag; word count updates live; "Regenereer" button is a no-op stub.
    - **Opdracht:** the question text; a question-type selector A/B/C/D; a "Mag volgende stop gaten" toggle. **Rule made visible & enforced:** when type B or C is selected, the gate toggle is forced off and disabled (B = honor, C = open); only A/D allow the gate on. Implement a pure helper `canGate(type): boolean` (A/D → true) and use it to drive the toggle's `disabled` + forced value.
    - Right rail: player preview reusing the story + question in a small `PhoneFrame`.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/screens/StopEditor.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StopEditor, canGate } from "./StopEditor";

test("canGate only allows A and D", () => {
  expect(canGate("A")).toBe(true);
  expect(canGate("D")).toBe(true);
  expect(canGate("B")).toBe(false);
  expect(canGate("C")).toBe(false);
});

test("selecting type B disables and forces off the gate toggle", async () => {
  render(<MemoryRouter><StopEditor /></MemoryRouter>);
  const gate = screen.getByRole("switch", { name: /gaten/i });
  expect(gate).toBeChecked(); // starts as Type A, gate on
  await userEvent.selectOptions(screen.getByLabelText(/Vraagtype/i), "B");
  expect(gate).toBeDisabled();
  expect(gate).not.toBeChecked();
});

test("verhaal word count updates as you edit", async () => {
  render(<MemoryRouter><StopEditor /></MemoryRouter>);
  const textarea = screen.getByLabelText(/Verhaal/i);
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "een twee drie");
  expect(screen.getByText(/3 woorden/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test StopEditor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per Interfaces. Export `canGate`. Use `<input role="switch" type="checkbox" aria-label="Mag volgende stop gaten">` for the toggle, `<select aria-label="Vraagtype">` for A/B/C/D, and `<textarea aria-label="Verhaal">` for the story. Port the zone markup from mockup lines 291–365.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test StopEditor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/mock/stop.ts frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): studio StopEditor with enforced gating rule"
```

---

### Task 16: Studio Validation (pre-publish) + studio routing finalize

**Files:**
- Create: `frontend/src/studio/screens/Validation.tsx`, `frontend/src/studio/mock/validation.ts`
- Modify: `frontend/src/studio/StudioApp.tsx` (route `/studio/route`, `/studio/stop`, `/studio/validate` to the real screens)
- Test: `frontend/src/studio/screens/Validation.test.tsx`

**Interfaces:**
- Produces:
  - `mock/validation.ts`: `VALIDATION_REPORT = { checks: { id; label; detail; status: "ok" | "warning"; meta }[]; perStop: { order; name; sources; grounded: boolean }[]; blocking: number; warnings: number }` (from mockup lines 629–671).
  - `Validation()` — port mockup **lines 624–677**: the checklist (grounding/walkability/distance ok + the Molen De Adriaan warning with 3 resolution buttons), the navy summary rail (blocking/warning counts + per-stop grounding), and "Publiceren naar moderatie" (no-op → shows a "Verzonden naar moderatie" confirmation).
  - StudioApp routes finalized.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/screens/Validation.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Validation } from "./Validation";

test("shows the warning and publishes to moderation", async () => {
  render(<MemoryRouter><Validation /></MemoryRouter>);
  expect(screen.getByText(/Molen De Adriaan/)).toBeInTheDocument();
  expect(screen.getByText(/1/)).toBeInTheDocument(); // warning count
  await userEvent.click(screen.getByRole("button", { name: /Publiceren naar moderatie/i }));
  expect(await screen.findByText(/Verzonden naar moderatie/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test Validation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per Interfaces; finalize StudioApp routes to point at `RouteEditor`, `StopEditor`, `Validation`.

- [ ] **Step 4: Run full suite + typecheck**

Run: `cd frontend && npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): studio Validation + finalize studio routing"
```

---

### Task 17: README + manual smoke against the live backend

**Files:**
- Create: `frontend/README.md`

**Interfaces:** none (docs + manual verification).

- [ ] **Step 1: Write `frontend/README.md`**

Document: prerequisites (Node ≥ 20), `npm install`, `npm run dev` (port 5173), the `/api` proxy, and that the backend must be running from the repo root for live data:
```
# from repo root, in one terminal:
source backend/.venv/bin/activate && PYTHONPATH=backend uvicorn app.main:app --port 8000
# in another terminal:
cd frontend && npm run dev
# open http://localhost:5173/play  and  http://localhost:5173/studio
```
Note: without the backend, `/play` generation will show the degrade error; the studio renders fully on mock data.

- [ ] **Step 2: Manual smoke (player happy path)**

Start the backend (repo root) and `npm run dev`. In the browser:
1. `/play` → pick distance/theme → "Genereer speurtocht" → preview appears with a real trail.
2. Start → "Ik ben er" → answer a stop → verify gating feedback → finish screen shows points + badges.
3. `/studio` → dashboard cards render; open route editor, stop editor (toggle Type B → gate disables), validation (publish → confirmation).

Record any mismatch as a follow-up; do not fix unrelated issues here.

- [ ] **Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs(frontend): run instructions + manual smoke checklist"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3 structure → Task 1; §4 design system → Tasks 2–4; §5 API → Task 5; §6 gaps → points/badges Task 6 (client-side), rating Task 12 (local), studio mock Tasks 13–16, real "generate concept" Task 14; §7 player screens → Tasks 8–12; §8 studio screens → Tasks 13–16; §9 testing → tests in every task; §10 out-of-scope respected (no backend changes, SVG map stands in for tiles).
- **Placeholder scan:** screen markup intentionally references exact mockup line ranges (the authoritative source) rather than re-pasting 90KB of HTML; all logic, bindings, and test code are given in full.
- **Type consistency:** `Trail`/`Stop`/`Question`/`AnswerResult` shapes match `schemas.py`; `pointsFor`/`deriveBadges`/`SolveRecord` names are consistent between Tasks 6, 7, 11, 12; `canGate` defined and tested in Task 15; store API names (`setTrail`, `goToStop`, `recordSolve`, `arriveAtNextOrFinish`, `reset`) consistent across Tasks 7–12.

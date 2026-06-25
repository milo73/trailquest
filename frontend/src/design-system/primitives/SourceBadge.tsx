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

export type CheckStatus = "ok" | "warning";

export type ValidationCheck = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  meta: string;
};

export type PerStopGrounding = {
  order: number;
  name: string;
  sources: string;
  grounded: boolean;
};

export type ValidationReport = {
  checks: ValidationCheck[];
  perStop: PerStopGrounding[];
  blocking: number;
  warnings: number;
};

export const VALIDATION_REPORT: ValidationReport = {
  checks: [
    {
      id: "grounding",
      label: "Grounding",
      detail: "Elk getoond feit heeft een bron (Wikidata / Wikipedia / OSM)",
      status: "ok",
      meta: "7 / 7 stops",
    },
    {
      id: "walkability",
      label: "Beloopbaarheid & veiligheid",
      detail: "Route over wandelnetwerk · geen gevaarlijke wegen of privéterrein",
      status: "ok",
      meta: "ok",
    },
    {
      id: "distance",
      label: "Afstandstolerantie",
      detail: "5,2 km — binnen ±15% van het doel (5 km)",
      status: "ok",
      meta: "ok",
    },
    {
      id: "molen-adriaan",
      label: "Stop 6 — Molen De Adriaan: geen verifieerbare feiten",
      detail: "Liever geen stop dan een foute stop. Kies hoe je hiermee omgaat:",
      status: "warning",
      meta: "geen feiten",
    },
  ],
  perStop: [
    { order: 1, name: "Grote Markt", sources: "OSM · Wikidata", grounded: true },
    { order: 2, name: "Stadhuis", sources: "Wikidata", grounded: true },
    { order: 3, name: "Vleeshal", sources: "Wikipedia", grounded: true },
    { order: 4, name: "Sint-Bavokerk", sources: "3 bronnen", grounded: true },
    { order: 5, name: "Hofje van Bakenes", sources: "Wikidata", grounded: true },
    { order: 6, name: "Molen De Adriaan", sources: "geen feiten", grounded: false },
  ],
  blocking: 0,
  warnings: 1,
};

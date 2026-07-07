import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TrailPreviewModal } from "./TrailPreviewModal";
import type { DraftTrail } from "../../api/types";

const draft: DraftTrail = {
  id: "d1",
  title: "Haarlem Gouden Eeuw",
  city: "Haarlem",
  theme: "historical",
  start: { lat: 52.38, lon: 4.63 },
  requested_distance_km: 5,
  actual_distance_km: 5.2,
  estimated_duration_min: 110,
  status: "concept",
  attributions: [],
  route_geometry: null,
  stops: [
    {
      id: "s1::historical",
      order: 1,
      poi: {
        id: "p1",
        name: "Stadhuis Haarlem",
        location: { lat: 52.381, lon: 4.636 },
        facts: [{ key: "built", value: "1622", source: { name: "Wikidata", license: "CC0", reference: "Q123" } }],
      },
      story: "Het Stadhuis van Haarlem staat al eeuwen in het hart van de stad en is een icoon van de Gouden Eeuw. Dit imposante gebouw werd gebouwd in opdracht van de stadsbestuurders.",
      questions: [
        {
          type: "A",
          prompt: "In welk jaar werd het Stadhuis gebouwd?",
          answer: "1622",
          hint: null,
          gates: true,
        },
      ],
      primary_question_index: 0,
    },
    {
      id: "s2::historical",
      order: 2,
      poi: {
        id: "p2",
        name: "Grote Markt",
        location: { lat: 52.382, lon: 4.637 },
        facts: [],
      },
      story: null,
      questions: [],
      primary_question_index: null,
    },
  ],
};

test("renders both POI names", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  expect(screen.getByText(/Stadhuis Haarlem/)).toBeInTheDocument();
  expect(screen.getByText(/Grote Markt/)).toBeInTheDocument();
});

test("renders story excerpt for stop with story", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  // The story is 175 chars long, so it should be truncated at 150 + "…"
  expect(screen.getByText(/Het Stadhuis van Haarlem.*…/)).toBeInTheDocument();
});

test("renders em dash for stop with no story", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  expect(screen.getByText("—")).toBeInTheDocument();
});

test("renders the primary question prompt", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  expect(screen.getByText("In welk jaar werd het Stadhuis gebouwd?")).toBeInTheDocument();
});

test("renders 3 markers (S + 2 stops)", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  expect(screen.getAllByTestId("marker")).toHaveLength(3);
});

test("calls onClose when Sluiten is clicked", async () => {
  const onClose = vi.fn();
  render(<TrailPreviewModal draft={draft} onClose={onClose} />);
  await userEvent.click(screen.getByRole("button", { name: "Sluiten" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("has dialog role with Voorvertoning label", () => {
  render(<TrailPreviewModal draft={draft} onClose={() => {}} />);
  expect(screen.getByRole("dialog", { name: "Voorvertoning" })).toBeInTheDocument();
});

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

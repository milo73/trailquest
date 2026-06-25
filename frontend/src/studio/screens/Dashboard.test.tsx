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

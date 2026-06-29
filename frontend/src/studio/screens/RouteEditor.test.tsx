import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RouteEditor } from "./RouteEditor";

test("reorders stops with the move-up control", async () => {
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

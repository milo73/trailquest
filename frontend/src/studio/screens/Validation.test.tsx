import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Validation } from "./Validation";

test("shows the warning and publishes to moderation", async () => {
  render(<MemoryRouter><Validation /></MemoryRouter>);

  // "Molen De Adriaan" appears in both the checklist warning row and the per-stop
  // grounding rail — assert at least one instance is present.
  expect(screen.getAllByText(/Molen De Adriaan/).length).toBeGreaterThanOrEqual(1);

  // Warning count is scoped to the WAARSCHUWING summary card to avoid collisions
  // with other "1" text nodes on the page (e.g. stop order numbers).
  const warningCard = screen.getByTestId("warning-count-card");
  expect(within(warningCard).getByText("1")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Publiceren naar moderatie/i }));
  expect(await screen.findByText(/Verzonden naar moderatie/i)).toBeInTheDocument();
});

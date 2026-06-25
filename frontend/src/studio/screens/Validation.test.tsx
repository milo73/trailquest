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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { NewTrailForm } from "./NewTrailForm";

test("submits place + distance + theme + from_concept and omits blank stops", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/plaats/i), "Bloemendaal");
  await userEvent.selectOptions(screen.getByLabelText(/thema/i), "nature");
  await userEvent.click(screen.getByRole("button", { name: /genereer/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    place: "Bloemendaal", theme: "nature", from_concept: true,
  }));
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("desired_stops");
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("start");
});

test("shows the error when onSubmit rejects and stays open", async () => {
  const onSubmit = vi.fn().mockRejectedValue({ name: "ApiError", status: 422, message: "Plaats 'x' niet gevonden" });
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/plaats/i), "x");
  await userEvent.click(screen.getByRole("button", { name: /genereer/i }));
  expect(await screen.findByText(/niet gevonden/i)).toBeInTheDocument();
});

test("submit is disabled until a place is entered", () => {
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /genereer/i })).toBeDisabled();
});

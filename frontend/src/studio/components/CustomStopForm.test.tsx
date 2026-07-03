import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CustomStopForm } from "./CustomStopForm";

test("submitting a Wikipedia/Wikidata link includes source_ref and allows an empty name", async () => {
  const onSubmit = vi.fn();
  render(<CustomStopForm start={{ lat: 52.38, lon: 4.63 }} onSubmit={onSubmit} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText(/link of qid/i), "Q42");
  await userEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ source_ref: "Q42" }));
});

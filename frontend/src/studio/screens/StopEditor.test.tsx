import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StopEditor, canGate } from "./StopEditor";

test("canGate only allows A and D", () => {
  expect(canGate("A")).toBe(true);
  expect(canGate("D")).toBe(true);
  expect(canGate("B")).toBe(false);
  expect(canGate("C")).toBe(false);
});

test("selecting type B disables and forces off the gate toggle", async () => {
  render(<MemoryRouter><StopEditor /></MemoryRouter>);
  const gate = screen.getByRole("switch", { name: /gaten/i });
  expect(gate).toBeChecked(); // starts as Type A, gate on
  await userEvent.selectOptions(screen.getByLabelText(/Vraagtype/i), "B");
  expect(gate).toBeDisabled();
  expect(gate).not.toBeChecked();
});

test("verhaal word count updates as you edit", async () => {
  render(<MemoryRouter><StopEditor /></MemoryRouter>);
  const textarea = screen.getByLabelText(/Verhaal/i);
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "een twee drie");
  expect(screen.getByText(/3 woorden/)).toBeInTheDocument();
});

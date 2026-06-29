import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Configure } from "./Configure";

afterEach(() => vi.restoreAllMocks());

function Harness() {
  const { state } = useQuester();
  return (
    <>
      <Configure />
      <output data-testid="phase">{state.phase}</output>
      <output data-testid="theme">{state.config.theme}</output>
    </>
  );
}

test("selecting a theme updates config and generating moves to preview", async () => {
  const trail = { id: "t1", stops: [{ order: 1 }] };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(trail), { status: 201 })),
  );
  render(
    <QuesterProvider>
      <Harness />
    </QuesterProvider>,
  );
  await userEvent.click(screen.getByText("Natuur"));
  expect(screen.getByTestId("theme")).toHaveTextContent("nature");
  await userEvent.click(screen.getByRole("button", { name: /Genereer speurtocht/i }));
  await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("preview"));
});

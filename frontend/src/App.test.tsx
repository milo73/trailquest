import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("renders the studio route", async () => {
  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Haarlems Gouden Eeuw")).toBeInTheDocument();
});

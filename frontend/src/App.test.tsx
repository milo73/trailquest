import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("renders the studio route", () => {
  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Haarlems Gouden Eeuw")).toBeInTheDocument();
});

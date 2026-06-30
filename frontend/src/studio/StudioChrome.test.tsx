import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

import { StudioChrome } from "./StudioChrome";

test("clicking the TrailQuest logo navigates to /studio", async () => {
  render(<StudioChrome><div>content</div></StudioChrome>);
  await userEvent.click(screen.getByRole("button", { name: /TrailQuest/i }));
  expect(navigate).toHaveBeenCalledWith("/studio");
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

test("fires onClick", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Start</Button>);
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(onClick).toHaveBeenCalledOnce();
});

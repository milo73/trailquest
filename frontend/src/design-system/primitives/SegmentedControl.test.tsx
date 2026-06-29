import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./SegmentedControl";

test("selects an option and marks it active", async () => {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      value="gps"
      onChange={onChange}
      options={[
        { value: "gps", label: "GPS" },
        { value: "zoeken", label: "Zoeken" },
      ]}
    />,
  );
  expect(screen.getByText("GPS")).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByText("Zoeken"));
  expect(onChange).toHaveBeenCalledWith("zoeken");
});

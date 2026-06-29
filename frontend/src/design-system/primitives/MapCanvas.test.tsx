import { render } from "@testing-library/react";
import { MapCanvas } from "./MapCanvas";

test("renders one labelled pin per stop", () => {
  const { container } = render(
    <MapCanvas
      stops={[
        { order: 1, label: "S" },
        { order: 2, label: "2" },
        { order: 3, label: "3" },
      ]}
      activeOrder={2}
    />,
  );
  // each pin label is an SVG <text>
  const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
  expect(labels).toEqual(expect.arrayContaining(["S", "2", "3"]));
});

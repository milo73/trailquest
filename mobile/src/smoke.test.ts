import { colors, spacing } from "./theme";

test("theme tokens exist", () => {
  expect(colors.terracotta).toBe("#b5453a");
  expect(spacing(2)).toBe(16);
});

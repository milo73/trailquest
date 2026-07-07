import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppButton } from "./ui";

test("AppButton fires onPress when pressed", async () => {
  const onPress = jest.fn();
  await render(<AppButton title="Klik mij" onPress={onPress} />);
  fireEvent.press(screen.getByText("Klik mij"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("AppButton respects disabled prop", async () => {
  const onPress = jest.fn();
  await render(<AppButton title="Uitgeschakeld" onPress={onPress} disabled />);
  fireEvent.press(screen.getByText("Uitgeschakeld"));
  expect(onPress).not.toHaveBeenCalled();
});

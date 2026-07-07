import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QuestionCard } from "./QuestionCard";

const Q = { type: "A", prompt: "Hoe hoog?", answer: "78", hint: "tel", gates: true } as const;

test("submits the typed answer", async () => {
  const onSubmit = jest.fn();
  await render(<QuestionCard question={Q} submitting={false} result={null} attempt={1} onSubmit={onSubmit} onHint={() => {}} hintShown={false} />);
  await act(() => {
    fireEvent.changeText(screen.getByPlaceholderText(/antwoord/i), "78");
    fireEvent.press(screen.getByText(/Controleer/i));
  });
  expect(onSubmit).toHaveBeenCalledWith("78");
});

test("shows feedback + revealed answer", async () => {
  await render(<QuestionCard question={Q} submitting={false} result={{ correct: false, unlocked_next: true, revealed_answer: "78", feedback: "Het antwoord was: 78." }} attempt={3} onSubmit={() => {}} onHint={() => {}} hintShown />);
  expect(screen.getByText(/Het antwoord was: 78/)).toBeTruthy();
});

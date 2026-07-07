import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { AnswerResult, Question } from "../api/types";
import { colors, spacing } from "../theme";
import { AppButton, Card } from "./ui";

export interface QuestionCardProps {
  question: Question;
  submitting: boolean;
  result: AnswerResult | null;
  attempt: number;
  onSubmit: (answer: string) => void;
  onHint: () => void;
  hintShown: boolean;
}

export function QuestionCard({
  question,
  submitting,
  result,
  attempt,
  onSubmit,
  onHint,
  hintShown,
}: QuestionCardProps) {
  const [inputValue, setInputValue] = useState("");
  // Keep a ref in sync so the press handler always reads the latest value,
  // even when the state update hasn't propagated yet (React 19 / async renderers).
  const inputRef = useRef("");

  const handleChangeText = (text: string) => {
    inputRef.current = text;
    setInputValue(text);
  };

  const handleSubmit = () => {
    onSubmit(inputRef.current);
  };

  const isTypeC = question.type === "C";

  if (isTypeC) {
    return (
      <Card style={styles.card}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        <Text style={styles.reflectionHint}>
          Deel jouw gedachten met anderen op de route.
        </Text>
        <AppButton title="Deel" onPress={() => onSubmit(inputRef.current)} />
      </Card>
    );
  }

  if (result != null) {
    return (
      <Card style={styles.card}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        <View style={styles.resultContainer}>
          <Text style={styles.feedback}>{result.feedback}</Text>
          {result.revealed_answer != null && (
            <Text style={styles.revealed}>
              Antwoord: {result.revealed_answer}
            </Text>
          )}
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.prompt}>{question.prompt}</Text>
      <TextInput
        style={styles.input}
        placeholder="Jouw antwoord"
        value={inputValue}
        onChangeText={handleChangeText}
        editable={!submitting}
      />
      <View style={styles.row}>
        <AppButton
          title="Controleer"
          onPress={handleSubmit}
          disabled={submitting}
        />
        {question.hint && question.gates && (
          <AppButton
            title="Hint"
            variant="ghost"
            onPress={onHint}
            disabled={submitting}
          />
        )}
      </View>
      {hintShown && question.hint && (
        <Text style={styles.hint}>Hint: {question.hint}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing(1),
  },
  prompt: {
    fontSize: 16,
    color: colors.navy,
    fontWeight: "600",
    marginBottom: spacing(0.5),
  },
  reflectionHint: {
    fontSize: 14,
    color: colors.navy,
    opacity: 0.7,
    marginBottom: spacing(1),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1),
    fontSize: 15,
    color: colors.navy,
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: "row",
    gap: spacing(1),
  },
  hint: {
    fontSize: 13,
    color: colors.terracotta,
    fontStyle: "italic",
  },
  resultContainer: {
    gap: spacing(0.5),
  },
  feedback: {
    fontSize: 15,
    color: colors.navy,
  },
  revealed: {
    fontSize: 14,
    color: colors.terracottaDeep,
    fontWeight: "600",
  },
});

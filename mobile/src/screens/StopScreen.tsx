import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { submitAnswer } from "../api/trails";
import type { AnswerResult } from "../api/types";
import { QuestionCard } from "../components/QuestionCard";
import { AppButton, Badge, Card } from "../components/ui";
import { useQuester } from "../store/QuesterStore";
import { colors, spacing } from "../theme";

export function StopScreen() {
  const { state, recordSolve, nextOrFinish } = useQuester();
  const trail = state.trail;
  const stop = trail?.stops.find((s) => s.order === state.currentOrder);

  const [attempt, setAttempt] = useState(1);
  const [hintShown, setHintShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  if (!trail || !stop) return null;

  // Capture non-nullable refs for use in closures
  const resolvedTrail = trail;
  const resolvedStop = stop;

  const { poi, story, questions } = resolvedStop;
  const primaryIndex = resolvedStop.primary_question_index;
  const question = questions[primaryIndex];

  if (!question) return null;

  const distinctSources = Array.from(
    new Map(poi.facts.map((f) => [f.source.name, f.source])).values(),
  );

  const bonusQuestions = questions
    .map((q, i) => ({ q, i }))
    .filter(({ i }) => i !== primaryIndex);

  async function handleSubmit(answer: string) {
    setSubmitting(true);
    try {
      const res = await submitAnswer(resolvedTrail.id, {
        stop_order: resolvedStop.order,
        answer,
        attempt,
        question_index: primaryIndex,
      });
      setResult(res);
      if (res.unlocked_next) {
        setUnlocked(true);
      } else {
        setAttempt((a) => a + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    recordSolve(resolvedStop.order, {
      type: question.type,
      correct: result?.correct ?? false,
      attempt,
      usedHint: hintShown,
    });
    nextOrFinish();
  }

  function handleHint() {
    setHintShown(true);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>
          STOP {resolvedStop.order} VAN {resolvedTrail.stops.length}
        </Text>
        <Text style={styles.poiName}>{poi.name}</Text>
      </View>

      {/* Story */}
      <Card>
        <Text style={styles.story}>{story}</Text>
        {distinctSources.length > 0 && (
          <View style={styles.sources}>
            {distinctSources.map((src) => (
              <Badge key={src.name} label={src.name} />
            ))}
          </View>
        )}
      </Card>

      {/* Primary question (gating) */}
      <QuestionCard
        question={question}
        submitting={submitting}
        result={result}
        attempt={attempt}
        onSubmit={(answer) => { void handleSubmit(answer); }}
        onHint={handleHint}
        hintShown={hintShown}
      />

      {/* Volgende button (only shown after unlocked) */}
      {unlocked && (
        <AppButton title="Volgende" onPress={handleNext} />
      )}

      {/* Bonus (non-primary) questions — never gate */}
      {bonusQuestions.length > 0 && (
        <View style={styles.bonusSection}>
          <Text style={styles.bonusHeader}>EXTRA VRAGEN</Text>
          {bonusQuestions.map(({ q, i }) => (
            <BonusQuestion
              key={i}
              question={q}
              trailId={resolvedTrail.id}
              stopOrder={resolvedStop.order}
              questionIndex={i}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function BonusQuestion({
  question,
  trailId,
  stopOrder,
  questionIndex,
}: {
  question: { prompt: string; type: string; hint?: string | null; gates: boolean };
  trailId: string;
  stopOrder: number;
  questionIndex: number;
}) {
  const [bonusResult, setBonusResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(answer: string) {
    setSubmitting(true);
    try {
      const res = await submitAnswer(trailId, {
        stop_order: stopOrder,
        answer,
        attempt: 1,
        question_index: questionIndex,
      });
      setBonusResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <QuestionCard
      question={question as Parameters<typeof QuestionCard>[0]["question"]}
      submitting={submitting}
      result={bonusResult}
      attempt={1}
      onSubmit={(answer) => { void handleSubmit(answer); }}
      onHint={() => {}}
      hintShown={false}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing(2),
    gap: spacing(2),
    paddingBottom: spacing(4),
  },
  headerSection: {
    gap: spacing(0.5),
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.terracotta,
    letterSpacing: 1.5,
  },
  poiName: {
    fontSize: 26,
    fontWeight: "400",
    color: colors.navy,
  },
  story: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.navy,
    marginBottom: spacing(1),
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(0.5),
  },
  bonusSection: {
    gap: spacing(1.5),
  },
  bonusHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.navy,
    opacity: 0.6,
    letterSpacing: 1,
  },
});

import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { colors, spacing } from "../theme";

// AppButton

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
}

export function AppButton({ title, onPress, disabled = false, variant = "primary" }: AppButtonProps) {
  const bg =
    variant === "primary"
      ? colors.terracotta
      : variant === "secondary"
        ? colors.navy
        : "transparent";
  const textColor =
    variant === "ghost" ? colors.terracotta : colors.white;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

// Card

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Badge

export interface BadgeProps {
  label: string;
}

export function Badge({ label }: BadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing(2),
  },
  badge: {
    backgroundColor: colors.sand,
    borderRadius: 99,
    paddingVertical: spacing(0.25),
    paddingHorizontal: spacing(1),
    alignSelf: "flex-start",
  },
  badgeText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: "600",
  },
});

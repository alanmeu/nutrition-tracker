import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";

export const theme = {
  bg: "#f4f7fc",
  card: "#ffffff",
  ink: "#0f2136",
  inkSoft: "#5e728d",
  line: "#d9e3f0",
  primary: "#0f766e",
  primaryDark: "#0b5f59",
  danger: "#b4232f",
  radius: 14
};

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor="#8aa" style={styles.input} {...props} />;
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.buttonPrimary, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.buttonPrimaryText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.buttonGhost, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.buttonGhostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 14,
    gap: 10,
    shadowColor: "#0f2136",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
    color: theme.ink
  },
  input: {
    borderWidth: 1,
    borderColor: "#cfd9e6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: "#fff"
  },
  buttonPrimary: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  buttonPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  buttonGhost: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#f1f5fb",
    borderWidth: 1,
    borderColor: "#d5deea",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  buttonGhostText: {
    color: "#1f334b",
    fontSize: 14,
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.6
  },
  pressed: {
    transform: [{ scale: 0.98 }]
  }
});

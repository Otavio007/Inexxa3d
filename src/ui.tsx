import React, { PropsWithChildren, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
export const colors = {
  ink: "#18281D",
  muted: "#6C7B6D",
  primary: "#2F6B45",
  soft: "#EAF3EB",
  border: "#E2E9E0",
  bg: "#F7F9F6",
  green: "#218263",
  red: "#BD3D54",
  amber: "#A66B14",
};
export const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    padding: 28,
    gap: 24,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  card: {
    minWidth: 0,
    maxWidth: "100%",
    backgroundColor: "white",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 16,
  },
  row: {
    minWidth: 0,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "white",
    borderColor: "#D6E0D2",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    minHeight: 46,
  },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border },
});
export function Txt({
  children,
  muted = false,
  small = false,
  bold = false,
}: PropsWithChildren<{ muted?: boolean; small?: boolean; bold?: boolean }>) {
  return (
    <Text
      style={[
        small ? styles.small : styles.body,
        {
          minWidth: 0,
          maxWidth: "100%",
          flexShrink: 1,
          ...(Platform.OS === "web"
            ? { overflowWrap: "anywhere" as const }
            : {}),
        },
        muted && { color: colors.muted },
        bold && { fontWeight: "700" },
      ]}
    >
      {children}
    </Text>
  );
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.row,
        { justifyContent: "space-between", alignItems: "flex-start" },
      ]}
    >
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 200,
          minWidth: 0,
          maxWidth: "100%",
          gap: 8,
        }}
      >
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  label,
  onPress,
  tone = "primary",
  icon,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger" | "ghost";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg =
    tone === "primary"
      ? colors.primary
      : tone === "danger"
        ? "#FCEEF1"
        : tone === "secondary"
          ? colors.soft
          : "transparent";
  const fg =
    tone === "primary"
      ? "white"
      : tone === "danger"
        ? colors.red
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 12,
        paddingHorizontal: 17,
        borderRadius: 12,
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 46,
        maxWidth: "100%",
        flexShrink: 1,
        opacity: disabled || loading ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Ionicons name={icon} size={18} color={fg} />
      )}
      <Text
        style={{
          fontSize: 14,
          fontWeight: "700",
          color: fg,
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 0 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#929F91"
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {!!hint && <Text style={[styles.small, { marginTop: 6 }]}>{hint}</Text>}
    </View>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  cents = false,
  integer = false,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  cents?: boolean;
  integer?: boolean;
  hint?: string;
}) {
  const format = (v: number) =>
    Number.isFinite(v)
      ? (cents ? (v / 100).toFixed(2) : String(v)).replace(".", ",")
      : "";
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused, cents]);
  return (
    <Field
      label={label}
      value={text}
      hint={hint}
      keyboardType="decimal-pad"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChangeText={(t) => {
        if (/^\d*([,.]\d*)?$/.test(t)) {
          setText(t);
          const n = Number(t.replace(",", "."));
          onChange(cents ? Math.round(n * 100) : integer ? Math.floor(n) : n);
        }
      }}
    />
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.row, { paddingVertical: 8 }]}
    >
      <View
        style={{
          width: 23,
          height: 23,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: value ? colors.primary : "#C7D4C3",
          backgroundColor: value ? colors.primary : "white",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value && <Ionicons name="checkmark" color="white" size={17} />}
      </View>
      <Txt>{label}</Txt>
    </Pressable>
  );
}
export function Badge({
  label,
  tone = "brand",
}: {
  label: string;
  tone?: "brand" | "green" | "red" | "amber";
}) {
  const color = {
    brand: colors.primary,
    green: colors.green,
    red: colors.red,
    amber: colors.amber,
  }[tone];
  return (
    <View
      style={{
        borderRadius: 7,
        paddingHorizontal: 9,
        paddingVertical: 5,
        backgroundColor: `${color}14`,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: error ? "#FCEEF1" : colors.soft,
      }}
    >
      <Text
        selectable
        style={{ color: error ? colors.red : colors.primary, lineHeight: 22 }}
      >
        {message}
      </Text>
    </View>
  );
}
export function Empty({
  icon = "cube-outline",
  title,
  subtitle,
  action,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        { alignItems: "center", paddingVertical: 52, gap: 14 },
      ]}
    >
      <View
        style={{ backgroundColor: colors.soft, padding: 19, borderRadius: 22 }}
      >
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Txt bold>{title}</Txt>
      <Text style={[styles.subtitle, { textAlign: "center", maxWidth: 380 }]}>
        {subtitle}
      </Text>
      {action}
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 60, alignItems: "center", gap: 16 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Txt muted>Carregando seus dados…</Txt>
    </View>
  );
}
export function Dialog({
  title,
  visible,
  onClose,
  children,
}: PropsWithChildren<{
  title: string;
  visible: boolean;
  onClose: () => void;
}>) {
  const { width } = useWindowDimensions();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#18281D88",
          justifyContent: "center",
          alignItems: "center",
          padding: width < 600 ? 10 : 32,
        }}
      >
        <View
          style={{
            backgroundColor: colors.bg,
            borderRadius: 24,
            width: "100%",
            maxWidth: 780,
            maxHeight: "95%",
            flexShrink: 1,
          }}
        >
          <View
            style={[
              styles.row,
              {
                padding: 20,
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 21,
                fontWeight: "800",
                color: colors.ink,
                flex: 1,
              }}
            >
              {title}
            </Text>
            <Button
              label="Fechar"
              tone="ghost"
              onPress={onClose}
              icon="close"
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 22, gap: 20 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export function Brand() {
  return (
    <View
      style={{
        width: 180,
        height: 96,
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      <Image
        accessibilityLabel="INNEXA 3D — Criativo, personalizado, premium"
        source={require("../assets/logo-transparent.png")}
        style={{
          width: "100%",
          height: "100%",
        }}
        resizeMode="contain"
      />
    </View>
  );
}
export function Grid({
  children,
  min = 240,
}: PropsWithChildren<{ min?: number }>) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
      {React.Children.map(
        children,
        (child) =>
          child && (
            <View
              style={{
                flexGrow: 1,
                flexBasis: min,
                minWidth: 0,
                maxWidth: "100%",
                flexShrink: 1,
              }}
            >
              {child}
            </View>
          ),
      )}
    </View>
  );
}

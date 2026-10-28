import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { displayDate, inputDate, todaySP, validDate } from "./domain";
import { Button, Field, Txt, colors, styles } from "./ui";

export function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return (
    digits.slice(0, 2) +
    (digits.length > 2 ? "/" + digits.slice(2, 4) : "") +
    (digits.length > 4 ? "/" + digits.slice(4) : "")
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(todaySP().slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const title = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  function move(delta: number) {
    const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    if (date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 9999)
      setMonth(date.toISOString().slice(0, 7));
  }
  function choose(date: string) {
    onChange(displayDate(date));
    setOpen(false);
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.row, { alignItems: "flex-end" }]}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Field
            label={label}
            placeholder="DD/MM/AAAA"
            value={value}
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(text) => onChange(maskDate(text))}
          />
        </View>
        <Button
          label={open ? "Fechar calendário" : "Calendário"}
          icon="calendar-outline"
          tone="secondary"
          onPress={() => {
            if (!open) {
              const date = inputDate(value);
              setMonth((validDate(date) ? date : todaySP()).slice(0, 7));
            }
            setOpen(!open);
          }}
        />
      </View>
      {open && (
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: "white",
            gap: 10,
            maxWidth: 360,
          }}
        >
          <View
            style={[
              styles.row,
              { justifyContent: "space-between", flexWrap: "nowrap" },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              onPress={() => move(-1)}
              style={{ padding: 12 }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Txt bold>{title}</Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              onPress={() => move(1)}
              style={{ padding: 12 }}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.primary}
              />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, i) => (
              <Text
                key={i}
                style={{
                  width: `${100 / 7}%`,
                  textAlign: "center",
                  color: colors.muted,
                }}
              >
                {day}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {Array.from(
              { length: Math.ceil((first + count) / 7) * 7 },
              (_, i) => {
                const day = i - first + 1;
                if (day < 1 || day > count)
                  return (
                    <View
                      key={i}
                      style={{ width: `${100 / 7}%`, height: 44 }}
                    />
                  );
                const date = `${month}-${String(day).padStart(2, "0")}`;
                const selected = date === inputDate(value);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={displayDate(date)}
                    accessibilityState={{ selected }}
                    onPress={() => choose(date)}
                    style={{
                      width: `${100 / 7}%`,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      backgroundColor: selected
                        ? colors.primary
                        : date === todaySP()
                          ? colors.soft
                          : "transparent",
                    }}
                  >
                    <Text style={{ color: selected ? "white" : colors.ink }}>
                      {day}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
          <View style={styles.row}>
            <Button
              label="Hoje"
              tone="ghost"
              onPress={() => choose(todaySP())}
            />
            <Button
              label="Sem data"
              tone="ghost"
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

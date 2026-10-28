import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Providers } from "../src/providers";
import { Text, View } from "react-native";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          {process.env.EXPO_PUBLIC_LOCAL_TEST === "true" && (
            <Text
              style={{
                backgroundColor: "#FFF2D2",
                color: "#78520B",
                textAlign: "center",
                padding: 8,
                fontSize: 12,
              }}
            >
              PRÉVIA DE TESTE · Dados fictícios locais · Não conectado ao
              Supabase
            </Text>
          )}
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </Providers>
    </SafeAreaProvider>
  );
}

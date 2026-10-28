import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configured = !!url && !!key && !url.includes("SEU-PROJETO");
export const supabase = createClient(
  configured ? url! : "https://placeholder.supabase.co",
  configured ? key! : "placeholder",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      flowType: "implicit",
    },
  },
);
if (Platform.OS !== "web")
  AppState.addEventListener("change", (state) =>
    state === "active"
      ? supabase.auth.startAutoRefresh()
      : supabase.auth.stopAutoRefresh(),
  );
export const photoUrl = (path: string) =>
  supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
export function errorText(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  const translations: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar.",
    "Failed to fetch":
      "Não foi possível conectar. Confira sua internet e tente novamente.",
    "Network request failed":
      "Não foi possível conectar. Confira sua internet e tente novamente.",
    "New password should be different from the old password.":
      "A nova senha deve ser diferente da anterior.",
  };
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "23514"
  )
    return "Confira os valores informados. Há um campo fora dos limites permitidos.";
  return (
    translations[message] ||
    message ||
    "Não foi possível concluir. Confira a conexão e tente novamente."
  );
}
export function check<T>({
  data,
  error,
}: {
  data: T;
  error: unknown;
}): NonNullable<T> {
  if (error) throw error;
  return data as NonNullable<T>;
}

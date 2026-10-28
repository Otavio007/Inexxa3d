import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { useApp } from "../src/providers";
import { configured, errorText, supabase } from "../src/supabase";
import {
  Brand,
  Button,
  Card,
  Field,
  Notice,
  Txt,
  colors,
  styles,
} from "../src/ui";
export default function Login() {
  const { session, recovery } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);
  if (session && !recovery) return <Redirect href="/dashboard" />;
  if (recovery) return <Redirect href="/reset-password" />;
  async function submit() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (!email.trim() || !email.includes("@"))
        throw new Error("Informe um e-mail válido.");
      if (!configured)
        throw new Error(
          "Configure a conexão com o Supabase para entrar. Consulte o README do projeto.",
        );
      if (forgot) {
        const redirectTo =
          Platform.OS === "web"
            ? `${process.env.EXPO_PUBLIC_SITE_URL || globalThis.location?.origin}/reset-password`
            : Linking.createURL("reset-password");
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        if (result.error) throw result.error;
        setMessage(
          "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
        );
      } else {
        const result = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (result.error) throw result.error;
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: 440, gap: 26 }}>
          <View style={{ alignItems: "center" }}>
            <Brand />
          </View>
          <Card>
            <Text style={styles.title}>
              {forgot
                ? "Vamos recuperar seu acesso."
                : "Seu próximo projeto começa aqui."}
            </Text>
            <Txt muted>
              {forgot
                ? "Enviaremos as instruções para o seu e-mail."
                : "Entre para cuidar dos produtos, das ideias e de cada encomenda."}
            </Txt>
            {!configured && (
              <Notice message="Ambiente ainda não conectado. Configure as variáveis do Supabase para usar a gestão." />
            )}
            <Field
              label="E-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {!forgot && (
              <Field
                label="Senha"
                secureTextEntry
                autoComplete="current-password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
              />
            )}
            {!!error && <Notice error message={error} />}
            {!!message && <Notice message={message} />}
            <Button
              label={forgot ? "Enviar link de recuperação" : "Entrar na gestão"}
              loading={busy}
              onPress={() => void submit()}
              icon="arrow-forward"
            />
            <Button
              label={forgot ? "Voltar para o login" : "Esqueci minha senha"}
              tone="ghost"
              onPress={() => {
                setForgot(!forgot);
                setError("");
                setMessage("");
              }}
            />
          </Card>
          <Button
            label="Voltar ao catálogo"
            tone="ghost"
            onPress={() => router.replace("/")}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { supabase, errorText } from "../src/supabase";
import { Brand, Button, Card, Field, Heading, Notice, colors } from "../src/ui";
import { useApp } from "../src/providers";
export default function ResetPassword() {
  const { session } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = Linking.useURL();
  useEffect(() => {
    if (!url || !url.includes("access_token=")) return;
    const params = new URLSearchParams(url.split("#")[1] || url.split("?")[1]);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token)
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) setError(errorText(error));
        });
  }, [url]);
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (password.length < 8)
        throw new Error("Use pelo menos oito caracteres.");
      if (password !== confirm) throw new Error("As senhas não coincidem.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <View style={{ width: "100%", maxWidth: 440, gap: 24 }}>
        <Brand />
        <Card>
          <Heading
            title="Uma nova senha"
            subtitle="Depois de salvar, entre novamente na sua conta."
          />
          {!session ? (
            <Notice message="Abra o link de recuperação enviado ao seu e-mail para definir uma nova senha." />
          ) : (
            <>
              <Field
                label="Nova senha"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Field
                label="Confirmar senha"
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
              />
              <Button
                label="Salvar nova senha"
                onPress={() => void save()}
                loading={busy}
              />
            </>
          )}
          {!!error && <Notice error message={error} />}
          <Button
            label="Voltar ao login"
            tone="ghost"
            onPress={() => router.replace("/login")}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

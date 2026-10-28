import React, { useEffect, useState } from "react";
import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { useApp } from "../../src/providers";
import { supabase, errorText } from "../../src/supabase";
import { Button, Loading, Notice, styles } from "../../src/ui";
import { AdminNavigation } from "../../src/AdminNavigation";
export default function AdminLayout() {
  const { session, authLoading, recovery } = useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAllowed(null);
    if (session)
      supabase.rpc("is_admin").then(({ data, error }) => {
        if (active) {
          setError(error ? errorText(error) : "");
          setAllowed(data === true);
        }
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  if (authLoading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (recovery) return <Redirect href="/reset-password" />;
  if (allowed === null) return <Loading />;
  if (!allowed)
    return (
      <View style={styles.page}>
        <Notice
          error
          message={
            error ||
            "Esta conta não tem acesso à gestão. Adicione o usuário à lista de administradores no Supabase conforme o guia de configuração."
          }
        />
        <Button
          label="Sair"
          onPress={() => {
            void supabase.auth.signOut();
          }}
        />
      </View>
    );
  return (
    <AdminNavigation>
      <Slot />
    </AdminNavigation>
  );
}

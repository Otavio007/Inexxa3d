import React, { PropsWithChildren, useEffect, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "./supabase";
import { Brand, colors } from "./ui";

const navigation = [
  ["/dashboard", "Visão geral", "grid-outline"],
  ["/products", "Produtos", "cube-outline"],
  ["/orders", "Encomendas", "receipt-outline"],
  ["/history", "Histórico", "time-outline"],
  ["/import", "Importar", "cloud-upload-outline"],
  ["/settings", "Custos e preços", "options-outline"],
] as const;
type Icon = React.ComponentProps<typeof Ionicons>["name"];

function IconButton({
  label,
  icon,
  onPress,
  expanded,
}: {
  label: string;
  icon: Icon;
  onPress: () => void;
  expanded?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

export function AdminNavigation({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const path = usePathname();
  const desktop = width >= 768;
  const [expandedPreference, setExpandedPreference] = useState<boolean | null>(
    null,
  );
  const expanded = expandedPreference ?? width >= 900;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = navigation.find(([href]) => path === href)?.[1] ?? "Gestão";

  useEffect(() => setDrawerOpen(false), [path, desktop]);

  function navigate(href: (typeof navigation)[number][0] | "/") {
    setDrawerOpen(false);
    if (href !== path) router.push(href);
  }

  function sidebar(compact: boolean, mobile: boolean) {
    return (
      <View
        nativeID={mobile ? "mobile-management-menu" : "management-menu"}
        style={[
          s.sidebar,
          { width: mobile ? Math.min(304, width - 40) : compact ? 80 : 248 },
        ]}
      >
        <View style={[s.sidebarHeader, compact && { paddingHorizontal: 12 }]}>
          <View style={[s.headerControls, compact && s.compactControls]}>
            {compact ? (
              <View style={s.monogram} accessibilityLabel="INNEXA 3D">
                <Text style={s.monogramText}>IN</Text>
              </View>
            ) : (
              <Text style={s.eyebrow}>ÁREA DE GESTÃO</Text>
            )}
            <IconButton
              label={
                mobile
                  ? "Fechar menu"
                  : compact
                    ? "Expandir menu lateral"
                    : "Recolher menu lateral"
              }
              icon={
                mobile
                  ? "close-outline"
                  : compact
                    ? "chevron-forward-outline"
                    : "chevron-back-outline"
              }
              expanded={mobile ? true : !compact}
              onPress={() =>
                mobile ? setDrawerOpen(false) : setExpandedPreference(!expanded)
              }
            />
          </View>
          {!compact && (
            <View style={s.logo}>
              <Brand />
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            s.scrollContent,
            compact && { paddingHorizontal: 12 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.links}>
            {navigation.map(([href, label, icon]) => {
              const selected = path === href;
              return (
                <Pressable
                  key={href}
                  accessibilityRole="link"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => navigate(href)}
                  style={({ pressed }) => [
                    s.navItem,
                    compact && s.compactItem,
                    selected && s.selectedItem,
                    pressed && s.pressed,
                  ]}
                >
                  {selected && <View style={s.activeMarker} />}
                  <Ionicons
                    name={icon}
                    size={22}
                    color={selected ? colors.primary : colors.muted}
                  />
                  {!compact && (
                    <Text style={[s.navLabel, selected && s.selectedLabel]}>
                      {label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ flex: 1, minHeight: 28 }} />
          <View style={s.footer}>
            {!compact && (
              <Text style={s.footerCaption}>CRIAR. PRODUZIR. ENTREGAR.</Text>
            )}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Abrir catálogo"
              onPress={() => navigate("/")}
              style={({ pressed }) => [
                s.navItem,
                s.catalogItem,
                compact && s.compactItem,
                pressed && s.pressed,
              ]}
            >
              <Ionicons name="open-outline" size={21} color={colors.primary} />
              {!compact && (
                <Text style={[s.navLabel, { color: colors.primary }]}>
                  Abrir catálogo
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sair da conta"
              onPress={() => {
                void supabase.auth.signOut();
              }}
              style={({ pressed }) => [
                s.navItem,
                compact && s.compactItem,
                pressed && s.pressed,
              ]}
            >
              <Ionicons name="log-out-outline" size={21} color={colors.muted} />
              {!compact && <Text style={s.navLabel}>Sair da conta</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={[s.frame, { flexDirection: desktop ? "row" : "column" }]}>
        {desktop ? (
          sidebar(!expanded, false)
        ) : (
          <View style={s.mobileHeader}>
            <IconButton
              label="Abrir menu de navegação"
              icon="menu-outline"
              expanded={drawerOpen}
              onPress={() => {
                Keyboard.dismiss();
                setDrawerOpen(true);
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.mobileBrand}>INNEXA 3D</Text>
              <Text numberOfLines={1} style={s.mobilePage}>
                {current}
              </Text>
            </View>
            <IconButton
              label="Abrir catálogo"
              icon="open-outline"
              onPress={() => navigate("/")}
            />
          </View>
        )}
        <View style={s.content}>{children}</View>
      </View>

      <Modal
        visible={!desktop && drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={s.drawerOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar menu lateral"
            style={StyleSheet.absoluteFill}
            onPress={() => setDrawerOpen(false)}
          />
          <SafeAreaView style={s.drawerSafeArea} accessibilityViewIsModal>
            {sidebar(false, true)}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  frame: { flex: 1, minHeight: 0 },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
  sidebar: {
    backgroundColor: "white",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: "100%",
  },
  sidebarHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  compactControls: { flexDirection: "column" },
  eyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  logo: { alignItems: "center", paddingTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -1,
  },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 20 },
  links: { gap: 7 },
  navItem: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  compactItem: { justifyContent: "center", paddingHorizontal: 0 },
  navLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
  },
  selectedItem: { backgroundColor: colors.soft },
  selectedLabel: { color: colors.primary, fontWeight: "700" },
  activeMarker: {
    position: "absolute",
    left: 0,
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.65, backgroundColor: colors.soft },
  footer: {
    gap: 7,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerCaption: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1.1,
    textAlign: "center",
    marginBottom: 8,
  },
  catalogItem: { backgroundColor: colors.soft },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileBrand: {
    fontSize: 12,
    letterSpacing: 1.3,
    fontWeight: "800",
    color: colors.ink,
  },
  mobilePage: { fontSize: 12, color: colors.muted },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "#18281D88",
    flexDirection: "row",
  },
  drawerSafeArea: { backgroundColor: "white", height: "100%" },
});

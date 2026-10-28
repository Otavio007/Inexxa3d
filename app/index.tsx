import React, { useMemo, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as api from "../src/api";
import { CatalogProduct, money, whatsappUrl } from "../src/domain";
import { useApp } from "../src/providers";
import { configured, errorText, photoUrl } from "../src/supabase";
import { useResource } from "../src/useResource";
import {
  Badge,
  Brand,
  Button,
  Dialog,
  Empty,
  Field,
  Heading,
  Loading,
  Notice,
  NumberField,
  Txt,
  colors,
  styles,
} from "../src/ui";
async function load() {
  return configured ? api.catalog() : [];
}
export default function Catalog() {
  const { data, loading, error, reload } = useResource(load);
  const { cart, setCart } = useApp();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [localError, setLocalError] = useState("");
  const [sending, setSending] = useState(false);
  const cats = useMemo(
    () => [
      "Todos",
      ...new Set(
        (data ?? [])
          .flatMap((p) => p.categories?.map((c) => c.name) ?? [p.category_name])
          .filter((c): c is string => !!c),
      ),
    ],
    [data],
  );
  const list = (data ?? []).filter(
    (p) =>
      (category === "Todos" ||
        (p.categories?.some((c) => c.name === category) ??
          p.category_name === category)) &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const chosen = selected?.variants.find((v) => v.id === variantId);
  function open(p: CatalogProduct) {
    setSelected(p);
    setVariantId(p.variants[0]?.id ?? "");
    setQuantity(1);
    setNotes("");
    setPhoto(0);
    setLocalError("");
  }
  function add() {
    if (
      !selected ||
      !chosen ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100000
    ) {
      setLocalError("Informe uma quantidade entre 1 e 100.000.");
      return;
    }
    setCart((c) => [
      ...c,
      {
        key: api.uuid(),
        product_id: selected.id,
        variant_id: chosen.id,
        name: selected.name,
        size: chosen.size,
        price_cents: chosen.price_cents,
        quantity,
        notes,
      },
    ]);
    setSelected(null);
    setShowCart(true);
  }
  async function send() {
    setSending(true);
    setLocalError("");
    try {
      const fresh = await api.catalog();
      const updated = cart.map((i) => {
        const p = fresh.find((p) => p.id === i.product_id);
        const v = p?.variants.find((v) => v.id === i.variant_id);
        if (!p || !v)
          throw new Error(
            `${i.name} não está mais disponível. Remova esse item para continuar.`,
          );
        return { ...i, name: p.name, size: v.size, price_cents: v.price_cents };
      });
      if (updated.some((i, n) => i.price_cents !== cart[n]?.price_cents)) {
        setCart(updated);
        throw new Error(
          "Alguns preços foram atualizados. Confira o novo total e toque em enviar novamente.",
        );
      }
      // Same-tab navigation keeps WhatsApp working in browsers that block
      // popups after the asynchronous price check (for example, mobile Safari).
      if (Platform.OS === "web")
        globalThis.location.assign(whatsappUrl(updated));
      else await Linking.openURL(whatsappUrl(updated));
    } catch (e) {
      setLocalError(errorText(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View
          style={{
            backgroundColor: "white",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={[
              styles.page,
              styles.row,
              { paddingVertical: 12, justifyContent: "space-between" },
            ]}
          >
            <Brand />
            <View style={styles.row}>
              <Button
                label={`Sacola (${cart.reduce((n, i) => n + i.quantity, 0)})`}
                icon="bag-handle-outline"
                onPress={() => {
                  setLocalError("");
                  setShowCart(true);
                }}
              />
            </View>
          </View>
        </View>
        <View style={styles.page}>
          <View
            style={{
              backgroundColor: "#173D2B",
              padding: width < 600 ? 28 : 48,
              borderRadius: 28,
              overflow: "hidden",
              gap: 20,
            }}
          >
            <View
              style={{
                position: "absolute",
                width: 260,
                height: 260,
                borderRadius: 75,
                borderWidth: 35,
                borderColor: "#5B936766",
                right: -60,
                top: -50,
                transform: [{ rotate: "32deg" }],
              }}
            />
            <Text
              style={{
                color: "#BFD8AF",
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 3,
              }}
            >
              CRIATIVO · PERSONALIZADO · PREMIUM
            </Text>
            <Text
              style={{
                color: "white",
                fontSize: width < 600 ? 34 : 52,
                fontWeight: "800",
                letterSpacing: -1.7,
                maxWidth: 650,
                lineHeight: width < 600 ? 41 : 59,
              }}
            >
              Ideias que ganham{"\n"}forma. E personalidade.
            </Text>
            <Text
              style={{
                color: "#D2E1D1",
                fontSize: 15,
                lineHeight: 24,
                maxWidth: 490,
              }}
            >
              Peças impressas em 3D para decorar, organizar e presentear.
              Escolha seus favoritos e dê seu toque pessoal.
            </Text>
            <View style={styles.row}>
              <Text
                style={{
                  color: "#D5E8C8",
                  backgroundColor: "#FFFFFF12",
                  borderRadius: 7,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                FEITO COM CUIDADO, PARA VOCÊ
              </Text>
              <Text style={{ color: "#D2E1D1", fontSize: 12 }}>
                Encomende pelo WhatsApp
              </Text>
            </View>
          </View>
          <Heading
            title="Explore a coleção"
            subtitle="Pequenos detalhes. Novas possibilidades."
          />
          <Field
            label="Encontre sua próxima ideia"
            placeholder="Buscar produto…"
            value={search}
            onChangeText={setSearch}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {cats.map((c) => (
              <Button
                key={c}
                label={c}
                tone={category === c ? "primary" : "secondary"}
                onPress={() => setCategory(c)}
              />
            ))}
          </ScrollView>
          {!configured && (
            <Notice message="O catálogo estará disponível assim que a conexão com o Supabase for configurada e os primeiros produtos forem publicados." />
          )}
          {!!error && (
            <>
              <Notice error message={error} />
              <Button label="Tentar novamente" onPress={() => void reload()} />
            </>
          )}
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty
              title={
                search || category !== "Todos"
                  ? "Nenhuma peça encontrada"
                  : "Novas formas estão chegando"
              }
              subtitle={
                search
                  ? "Experimente outro termo ou categoria."
                  : "Em breve, você poderá escolher suas peças favoritas por aqui."
              }
            />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
              {list.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${p.name}`}
                  onPress={() => open(p)}
                  style={{
                    width:
                      width >= 1100 ? "31.9%" : width >= 650 ? "48%" : "100%",
                    backgroundColor: "white",
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  {p.photos[0] ? (
                    <Image
                      source={{ uri: photoUrl(p.photos[0].path) }}
                      style={{ width: "100%", aspectRatio: 1.25 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        aspectRatio: 1.25,
                        backgroundColor: colors.soft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="cube-outline" size={64} color="#A8C4A2" />
                    </View>
                  )}
                  <View style={{ padding: 20, gap: 10 }}>
                    <Txt small muted>
                      {p.categories?.map((c) => c.name).join(" · ") ||
                        p.category_name ||
                        "Feito em 3D"}
                    </Txt>
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 19,
                        fontWeight: "700",
                      }}
                    >
                      {p.name}
                    </Text>
                    <Text numberOfLines={2} style={styles.subtitle}>
                      {p.description || "Uma peça com a sua personalidade."}
                    </Text>
                    <View
                      style={[
                        styles.row,
                        { justifyContent: "space-between", marginTop: 6 },
                      ]}
                    >
                      <View>
                        {p.variants.length > 1 && <Txt small>A partir de</Txt>}
                        <Text
                          style={{
                            color: colors.primary,
                            fontSize: 23,
                            fontWeight: "800",
                          }}
                        >
                          {money(
                            Math.min(...p.variants.map((v) => v.price_cents)),
                          )}
                        </Text>
                      </View>
                      <Ionicons
                        name="arrow-forward-circle"
                        size={34}
                        color={colors.primary}
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ alignItems: "center", paddingTop: 28, gap: 8 }}>
            <Txt bold>INNEXA 3D</Txt>
            <Txt small>Criativo. Personalizado. Premium.</Txt>
          </View>
        </View>
      </ScrollView>
      <Dialog
        visible={!!selected}
        title={selected?.name ?? ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            {selected.photos[photo] && (
              <Image
                source={{ uri: photoUrl(selected.photos[photo]!.path) }}
                style={{ width: "100%", aspectRatio: 1.3, borderRadius: 16 }}
                resizeMode="contain"
              />
            )}
            <View style={styles.row}>
              {selected.photos.map((p, i) => (
                <Pressable
                  key={p.path}
                  accessibilityLabel={`Foto ${i + 1}`}
                  onPress={() => setPhoto(i)}
                >
                  <Image
                    source={{ uri: photoUrl(p.path) }}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      borderWidth: photo === i ? 2 : 0,
                      borderColor: colors.primary,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            <Txt>{selected.description}</Txt>
            <Txt bold>Escolha o tamanho</Txt>
            <View style={styles.row}>
              {selected.variants.map((v) => (
                <Button
                  key={v.id}
                  label={`${v.size} · ${money(v.price_cents)}`}
                  tone={v.id === variantId ? "primary" : "secondary"}
                  onPress={() => setVariantId(v.id)}
                />
              ))}
            </View>
            <NumberField
              label="Quantidade"
              integer
              value={quantity}
              onChange={setQuantity}
            />
            <Field
              label="Seu toque pessoal (opcional)"
              placeholder="Cor desejada, nome a imprimir, detalhes…"
              multiline
              value={notes}
              onChangeText={setNotes}
            />
            <Txt small>
              Personalizações e prazo serão confirmados pelo WhatsApp.
            </Txt>
            {!!localError && <Notice error message={localError} />}
            <Button
              label={`Adicionar à sacola · ${money((chosen?.price_cents ?? 0) * quantity)}`}
              icon="bag-add-outline"
              onPress={add}
            />
          </>
        )}
      </Dialog>
      <Dialog
        visible={showCart}
        title="Sua sacola de ideias"
        onClose={() => setShowCart(false)}
      >
        {cart.length === 0 ? (
          <Empty
            icon="bag-outline"
            title="Sua sacola está vazia"
            subtitle="Escolha uma peça da coleção para começar."
          />
        ) : (
          <>
            {cart.map((i) => (
              <View key={i.key} style={[styles.card, { padding: 16 }]}>
                <Txt bold>{i.name}</Txt>
                <Txt small>
                  {i.size} · {money(i.price_cents)} por unidade
                </Txt>
                <NumberField
                  label="Quantidade"
                  integer
                  value={i.quantity}
                  onChange={(quantity) =>
                    setCart((c) =>
                      c.map((x) =>
                        x.key === i.key
                          ? {
                              ...x,
                              quantity: Math.max(1, Math.min(100000, quantity)),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <Field
                  label="Personalização"
                  value={i.notes}
                  onChangeText={(notes) =>
                    setCart((c) =>
                      c.map((x) => (x.key === i.key ? { ...x, notes } : x)),
                    )
                  }
                />
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Txt bold>{money(i.quantity * i.price_cents)}</Txt>
                  <Button
                    label="Remover"
                    tone="danger"
                    onPress={() =>
                      setCart((c) => c.filter((x) => x.key !== i.key))
                    }
                  />
                </View>
              </View>
            ))}
            <Heading
              title={money(
                cart.reduce((sum, i) => sum + i.quantity * i.price_cents, 0),
              )}
              subtitle="Total dos produtos. Entrega e personalizações a combinar."
            />
            {!!localError && <Notice error message={localError} />}
            <Button
              label="Enviar encomenda pelo WhatsApp"
              icon="logo-whatsapp"
              loading={sending}
              onPress={() => void send()}
            />
            <Txt small>
              Você conversará diretamente com a INNEXA 3D para confirmar a
              encomenda.
            </Txt>
          </>
        )}
      </Dialog>
    </SafeAreaView>
  );
}

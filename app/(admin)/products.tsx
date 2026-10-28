import React, { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as api from "../../src/api";
import {
  Product,
  Variant,
  costBreakdown,
  money,
  suggestedPrice,
} from "../../src/domain";
import { errorText, photoUrl } from "../../src/supabase";
import { pickFile } from "../../src/files";
import { useResource } from "../../src/useResource";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Empty,
  Field,
  Grid,
  Heading,
  Loading,
  Notice,
  NumberField,
  Toggle,
  Txt,
  colors,
  styles,
} from "../../src/ui";
async function load() {
  const [products, settings, categories] = await Promise.all([
    api.products(),
    api.settings(),
    api.categories(),
  ]);
  return { products, settings, categories };
}
const freshVariant = (): Variant => ({
  id: api.uuid(),
  size: "Padrão",
  grams: 0,
  minutes: 0,
  extras_cents: 0,
  cost_cents: 0,
  price_cents: 90,
  automatic: true,
});
function ProductAction({
  label,
  icon,
  onPress,
  danger = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={label}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          pressed || hovered
            ? danger
              ? "#FCEEF1"
              : colors.soft
            : "transparent",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={19}
        color={danger ? colors.red : colors.muted}
      />
    </Pressable>
  );
}
export default function Products() {
  const { data, loading, error, reload } = useResource(load);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);
  const [duplicated, setDuplicated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [deleteProduct, setDeleteProduct] = useState<Product[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const visibleProducts = (data?.products ?? []).filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedProducts = (data?.products ?? []).filter((p) =>
    selected.includes(p.id),
  );
  function requestDelete(products: Product[]) {
    setDeleteProblem("");
    setDeleteProduct(products);
  }
  const [deleteProblem, setDeleteProblem] = useState("");
  async function confirmDeleteProduct() {
    if (!deleteProduct || busy) return;
    setBusy(true);
    setDeleteProblem("");
    try {
      for (const product of deleteProduct) {
        await api.deleteProduct(product.id);
        setSelected((ids) => ids.filter((id) => id !== product.id));
        setDeleteProduct(
          (pending) => pending?.filter((p) => p.id !== product.id) ?? null,
        );
      }
      setDeleteProduct(null);
    } catch (e) {
      setDeleteProblem(
        `A exclusão parou. Os produtos já excluídos foram removidos da seleção. Tente novamente para excluir os restantes. ${errorText(e)}`,
      );
    } finally {
      void reload();
      setBusy(false);
    }
  }
  const [deleteAsset, setDeleteAsset] = useState<{
    id: string;
    path: string;
    image: boolean;
  } | null>(null);
  function open(product?: Product) {
    setDuplicated(false);
    setDraft(
      product
        ? JSON.parse(JSON.stringify(product))
        : {
            id: api.uuid(),
            name: "",
            description: "",
            category_id: null,
            category_ids: [],
            published: false,
            variants: [freshVariant()],
            photos: [],
            files: [],
          },
    );
    setSaved(!!product);
    setProblem("");
  }
  function duplicate(product: Product) {
    setDraft({
      ...product,
      id: api.uuid(),
      name: `${product.name.slice(0, 192)} (cópia)`,
      published: false,
      variants: product.variants.map((variant) => ({
        ...variant,
        id: api.uuid(),
      })),
      photos: [],
      files: [],
    });
    setSaved(false);
    setDuplicated(true);
    setProblem("");
    setCategoryName("");
  }
  function update(patch: Partial<Product>) {
    setDraft((d) => d && { ...d, ...patch });
  }
  function changeVariant(id: string, patch: Partial<Variant>) {
    setDraft(
      (d) =>
        d && {
          ...d,
          variants: d.variants.map((v) =>
            v.id === id ? { ...v, ...patch } : v,
          ),
        },
    );
  }
  function validate() {
    if (!draft?.name.trim()) throw new Error("Informe o nome do produto.");
    if (
      !draft.variants.length ||
      draft.variants.some(
        (v) =>
          !v.size.trim() ||
          !Number.isFinite(v.grams) ||
          v.grams < 0 ||
          !Number.isInteger(v.minutes) ||
          v.minutes < 0 ||
          v.price_cents < 0,
      )
    )
      throw new Error("Preencha os tamanhos, consumos e tempos corretamente.");
  }
  async function save(close: boolean) {
    setBusy(true);
    setProblem("");
    try {
      validate();
      await api.saveProduct(draft!);
      setSaved(true);
      if (close) setDraft(null);
      void reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function asset(image: boolean) {
    if (!draft) return;
    setBusy(true);
    setProblem("");
    try {
      const file = await pickFile(
        image ? ["image/jpeg", "image/png", "image/webp"] : "*/*",
      );
      if (!file) return;
      const result = await api.upload(
        draft.id,
        file.name,
        file.bytes,
        file.mime,
        image,
        draft.photos.length
          ? Math.max(...draft.photos.map((p) => p.position)) + 1
          : 0,
      );
      if (image) update({ photos: [...draft.photos, result] });
      else update({ files: [...draft.files, result] });
      void reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleteAsset || !draft) return;
    setBusy(true);
    try {
      await api.removeAsset(deleteAsset, deleteAsset.image);
      update(
        deleteAsset.image
          ? { photos: draft.photos.filter((p) => p.id !== deleteAsset.id) }
          : { files: draft.files.filter((p) => p.id !== deleteAsset.id) },
      );
      setDeleteAsset(null);
      void reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function category() {
    if (!categoryName.trim()) return;
    setBusy(true);
    try {
      const c = await api.addCategory(categoryName.trim());
      update({
        category_ids: [
          ...new Set([
            ...(draft?.category_ids ??
              (draft?.category_id ? [draft.category_id] : [])),
            c.id,
          ]),
        ],
      });
      setCategoryName("");
      void reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        <Heading
          title="Seu universo de produtos"
          subtitle="Da primeira ideia ao preço certo. Tudo em um só lugar."
          action={
            <Button label="Novo produto" icon="add" onPress={() => open()} />
          }
        />
        <Field
          label="Buscar produtos"
          placeholder="Nome ou descrição…"
          value={search}
          onChangeText={setSearch}
        />
        {!!data?.products.length && (
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={styles.row}>
              <Toggle
                label="Selecionar todos os resultados"
                value={
                  visibleProducts.length > 0 &&
                  visibleProducts.every((p) => selected.includes(p.id))
                }
                onChange={(value) =>
                  setSelected((ids) =>
                    value
                      ? [
                          ...new Set([
                            ...ids,
                            ...visibleProducts.map((p) => p.id),
                          ]),
                        ]
                      : ids.filter(
                          (id) => !visibleProducts.some((p) => p.id === id),
                        ),
                  )
                }
              />
              <Txt small>{selectedProducts.length} selecionado(s)</Txt>
            </View>
            {!!selectedProducts.length && (
              <View style={styles.row}>
                <Button
                  label="Limpar seleção"
                  tone="ghost"
                  onPress={() => setSelected([])}
                />
                <Button
                  label={`Excluir selecionados (${selectedProducts.length})`}
                  icon="trash-outline"
                  tone="danger"
                  onPress={() => requestDelete(selectedProducts)}
                />
              </View>
            )}
          </View>
        )}
        {!!error && (
          <>
            <Notice error message={error} />
            <Button label="Tentar novamente" onPress={() => void reload()} />
          </>
        )}
        {loading ? (
          <Loading />
        ) : data?.products.length === 0 ? (
          <Empty
            title="Dê forma ao seu catálogo"
            subtitle="Cadastre o primeiro produto ou importe os dados da sua planilha."
            action={<Button label="Cadastrar produto" onPress={() => open()} />}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {visibleProducts.map((p) => (
              <Card key={p.id}>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Selecionar ${p.name}`}
                    accessibilityState={{ checked: selected.includes(p.id) }}
                    onPress={() =>
                      setSelected((ids) =>
                        ids.includes(p.id)
                          ? ids.filter((id) => id !== p.id)
                          : [...ids, p.id],
                      )
                    }
                    style={{
                      width: 40,
                      height: 44,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name={
                        selected.includes(p.id) ? "checkbox" : "square-outline"
                      }
                      size={23}
                      color={
                        selected.includes(p.id) ? colors.primary : colors.muted
                      }
                    />
                  </Pressable>
                  {p.photos[0] ? (
                    <Image
                      source={{ uri: photoUrl(p.photos[0].path) }}
                      style={{ width: 76, height: 76, borderRadius: 14 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 76,
                        height: 76,
                        backgroundColor: colors.soft,
                        borderRadius: 14,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name="cube-outline"
                        size={30}
                        color={colors.primary}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 150, gap: 6 }}>
                    <Txt bold>{p.name}</Txt>
                    <Txt small>
                      {p.variants.length} tamanho(s) · a partir de{" "}
                      {money(Math.min(...p.variants.map((v) => v.price_cents)))}
                    </Txt>
                    <Badge
                      label={p.published ? "No catálogo" : "Somente na gestão"}
                      tone={p.published ? "green" : "brand"}
                    />
                  </View>
                  <View
                    style={{ flexDirection: "row", gap: 2, marginLeft: "auto" }}
                  >
                    <ProductAction
                      label="Editar produto"
                      icon="create-outline"
                      onPress={() => open(p)}
                    />
                    <ProductAction
                      label="Excluir produto"
                      danger
                      icon="trash-outline"
                      onPress={() => {
                        requestDelete([p]);
                      }}
                    />
                    <ProductAction
                      label="Duplicar produto"
                      icon="copy-outline"
                      onPress={() => duplicate(p)}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
      <Dialog
        visible={!!draft}
        title={
          saved
            ? "Editar produto"
            : duplicated
              ? "Duplicar produto"
              : "Uma nova ideia"
        }
        onClose={() => {
          if (!busy) setDraft(null);
        }}
      >
        {draft && data && (
          <>
            {duplicated && !saved && (
              <Notice message="Nome, descrição, categoria, tamanhos, consumos e preços foram copiados. Revise e salve para criar um produto independente. A cópia começa fora do catálogo; fotos e arquivos devem ser adicionados novamente." />
            )}
            <Field
              label="Nome do produto"
              placeholder="Ex.: Vaso orgânico"
              value={draft.name}
              onChangeText={(name) => update({ name })}
              maxLength={200}
            />
            <Field
              label="Descrição"
              multiline
              value={draft.description}
              onChangeText={(description) => update({ description })}
            />
            <Txt bold>Categorias</Txt>
            <Txt small>
              Selecione uma ou mais categorias. Toque novamente para desmarcar.
            </Txt>
            <View style={styles.row}>
              <Button
                label="Sem categoria"
                tone={
                  !(
                    draft.category_ids ??
                    (draft.category_id ? [draft.category_id] : [])
                  ).length
                    ? "primary"
                    : "secondary"
                }
                onPress={() => update({ category_id: null, category_ids: [] })}
              />
              {data.categories.map((c) => (
                <Button
                  key={c.id}
                  label={c.name}
                  tone={
                    (
                      draft.category_ids ??
                      (draft.category_id ? [draft.category_id] : [])
                    ).includes(c.id)
                      ? "primary"
                      : "secondary"
                  }
                  onPress={() => {
                    const ids =
                      draft.category_ids ??
                      (draft.category_id ? [draft.category_id] : []);
                    const next = ids.includes(c.id)
                      ? ids.filter((id) => id !== c.id)
                      : [...ids, c.id];
                    update({
                      category_ids: next,
                      category_id: next[0] ?? null,
                    });
                  }}
                />
              ))}
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Criar categoria"
                  value={categoryName}
                  onChangeText={setCategoryName}
                  maxLength={100}
                />
              </View>
              <Button
                label="Adicionar"
                tone="secondary"
                disabled={busy || !categoryName.trim()}
                onPress={() => void category()}
              />
            </View>
            <Toggle
              label="Exibir este produto no catálogo público"
              value={draft.published}
              onChange={(published) => update({ published })}
            />
            <Heading
              title="Tamanhos e preços"
              subtitle="Cada tamanho tem seu próprio consumo, tempo e preço."
            />
            {draft.variants.map((v, index) => {
              const breakdown = costBreakdown(v, data.settings);
              const suggested = suggestedPrice(
                breakdown.total,
                data.settings.markup_percent,
              );
              const price = v.automatic ? suggested : v.price_cents;
              return (
                <Card key={v.id}>
                  <View
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <Txt bold>Opção {index + 1}</Txt>
                    {draft.variants.length > 1 && (
                      <Button
                        label="Remover tamanho"
                        tone="danger"
                        onPress={() =>
                          update({
                            variants: draft.variants.filter(
                              (x) => x.id !== v.id,
                            ),
                          })
                        }
                      />
                    )}
                  </View>
                  <Field
                    label="Descrição do tamanho"
                    placeholder="Ex.: Pequeno — 10 cm"
                    value={v.size}
                    onChangeText={(size) => changeVariant(v.id, { size })}
                    maxLength={200}
                  />
                  <Grid>
                    <NumberField
                      label="Filamento (gramas)"
                      value={v.grams}
                      onChange={(grams) => changeVariant(v.id, { grams })}
                    />
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <NumberField
                          label="Horas"
                          integer
                          value={Math.floor(v.minutes / 60)}
                          onChange={(h) =>
                            changeVariant(v.id, {
                              minutes: h * 60 + (v.minutes % 60),
                            })
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <NumberField
                          label="Minutos (0–59)"
                          integer
                          value={v.minutes % 60}
                          onChange={(m) =>
                            changeVariant(v.id, {
                              minutes:
                                Math.floor(v.minutes / 60) * 60 +
                                Math.min(m, 59),
                            })
                          }
                        />
                      </View>
                    </View>
                    <NumberField
                      label="Custos extras (R$)"
                      cents
                      value={v.extras_cents}
                      onChange={(extras_cents) =>
                        changeVariant(v.id, { extras_cents })
                      }
                    />
                    <NumberField
                      label="Preço de venda (R$)"
                      cents
                      value={price}
                      onChange={(price_cents) =>
                        changeVariant(v.id, { price_cents, automatic: false })
                      }
                    />
                  </Grid>
                  <View
                    style={{
                      backgroundColor: colors.bg,
                      borderRadius: 12,
                      padding: 14,
                      gap: 7,
                    }}
                  >
                    <Txt small>
                      PLA {money(breakdown.material)} · Energia{" "}
                      {money(breakdown.energy)}
                    </Txt>
                    <Txt small>
                      Embalagem {money(breakdown.packaging)} · Desgaste{" "}
                      {money(breakdown.wear)} · Extras {money(breakdown.extras)}
                    </Txt>
                    <View
                      style={[styles.row, { justifyContent: "space-between" }]}
                    >
                      <Txt bold>Custo: {money(breakdown.total)}</Txt>
                      <Txt bold>
                        Lucro estimado: {money(price - breakdown.total)}
                      </Txt>
                    </View>
                    <Txt small>
                      Sugestão com acréscimo de {data.settings.markup_percent}%:{" "}
                      {money(suggested)}
                    </Txt>
                  </View>
                  <View style={styles.row}>
                    <Badge
                      label={v.automatic ? "Preço automático" : "Preço manual"}
                      tone={v.automatic ? "green" : "amber"}
                    />
                    {!v.automatic && (
                      <Button
                        label="Restaurar automático"
                        tone="ghost"
                        onPress={() => changeVariant(v.id, { automatic: true })}
                      />
                    )}
                  </View>
                </Card>
              );
            })}
            <Button
              label="Adicionar tamanho"
              tone="secondary"
              icon="add"
              onPress={() =>
                update({
                  variants: [
                    ...draft.variants,
                    { ...freshVariant(), size: "" },
                  ],
                })
              }
            />
            <Heading
              title="Fotos e arquivos"
              subtitle="A primeira foto é a capa. Arquivos de impressão ficam privados."
            />
            {!saved ? (
              <>
                <Notice message="Salve os dados para liberar o envio de fotos e arquivos." />
                <Button
                  label="Salvar e adicionar arquivos"
                  loading={busy}
                  onPress={() => void save(false)}
                />
              </>
            ) : (
              <>
                <View style={styles.row}>
                  {draft.photos.map((p) => (
                    <View key={p.id} style={{ gap: 5 }}>
                      <Image
                        source={{ uri: photoUrl(p.path) }}
                        style={{ width: 120, height: 110, borderRadius: 12 }}
                      />
                      <Button
                        label="Excluir foto"
                        tone="danger"
                        disabled={busy}
                        onPress={() => setDeleteAsset({ ...p, image: true })}
                      />
                    </View>
                  ))}
                </View>
                <Button
                  label="Adicionar foto · até 10 MB"
                  icon="image-outline"
                  tone="secondary"
                  disabled={busy}
                  onPress={() => void asset(true)}
                />
                {draft.files.map((f) => (
                  <View style={[styles.card, { padding: 12 }]} key={f.id}>
                    <Txt>{f.name}</Txt>
                    <View style={styles.row}>
                      <Button
                        label="Baixar arquivo"
                        icon="download-outline"
                        tone="secondary"
                        disabled={busy}
                        onPress={async () => {
                          try {
                            await Linking.openURL(
                              await api.downloadFile(f.path),
                            );
                          } catch (e) {
                            setProblem(errorText(e));
                          }
                        }}
                      />
                      <Button
                        label="Excluir"
                        tone="danger"
                        disabled={busy}
                        onPress={() => setDeleteAsset({ ...f, image: false })}
                      />
                    </View>
                  </View>
                ))}
                <Button
                  label="Adicionar STL, 3MF ou OBJ · até 100 MB"
                  icon="attach-outline"
                  tone="secondary"
                  disabled={busy}
                  onPress={() => void asset(false)}
                />
              </>
            )}
            {!!problem && <Notice error message={problem} />}
            <Button
              label="Salvar produto"
              icon="checkmark"
              loading={busy}
              onPress={() => void save(true)}
            />
          </>
        )}
      </Dialog>
      <Dialog
        visible={!!deleteProduct}
        title={
          deleteProduct?.length === 1
            ? "Excluir produto?"
            : `Excluir ${deleteProduct?.length ?? 0} produtos?`
        }
        onClose={() => {
          if (!busy) setDeleteProduct(null);
        }}
      >
        <Txt>
          {deleteProduct?.length === 1
            ? `Deseja excluir “${deleteProduct[0]?.name}”?`
            : `Deseja excluir os ${deleteProduct?.length ?? 0} produtos selecionados?`}{" "}
          Eles sairão da lista de produtos e do catálogo. As encomendas
          anteriores e seus valores serão preservados.
        </Txt>
        {!!deleteProblem && <Notice error message={deleteProblem} />}
        <View style={styles.row}>
          <Button
            label="Cancelar"
            tone="secondary"
            disabled={busy}
            onPress={() => setDeleteProduct(null)}
          />
          <Button
            label="Confirmar exclusão"
            tone="danger"
            loading={busy}
            onPress={() => void confirmDeleteProduct()}
          />
        </View>
      </Dialog>
      <Dialog
        visible={!!deleteAsset}
        title="Excluir este arquivo?"
        onClose={() => setDeleteAsset(null)}
      >
        <Txt>
          O arquivo será removido do armazenamento. Essa ação não pode ser
          desfeita.
        </Txt>
        <Button
          label="Confirmar exclusão"
          tone="danger"
          loading={busy}
          onPress={() => void remove()}
        />
      </Dialog>
    </>
  );
}

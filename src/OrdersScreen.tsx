import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import * as api from "./api";
import {
  Order,
  OrderItem,
  Stage,
  archived,
  displayDate,
  inputDate,
  money,
  orderTotal,
  received,
  sortOrders,
  stages,
  todaySP,
  validDate,
} from "./domain";
import { errorText } from "./supabase";
import { useResource } from "./useResource";
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
} from "./ui";
async function load() {
  const [orders, products] = await Promise.all([api.orders(), api.products()]);
  return { orders, products };
}
type Draft = {
  id: string;
  customer_name: string;
  phone: string;
  urgent: boolean;
  due_date: string;
  discount_kind: "amount" | "percent";
  discount_value: number;
  items: (OrderItem & { key: string })[];
};
export function OrdersScreen({ history = false }: { history?: boolean }) {
  const { data, loading, error, reload } = useResource(load);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [confirmation, setConfirmation] = useState<"cancel" | "reopen" | null>(
    null,
  );
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(displayDate(todaySP()));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentId, setPaymentId] = useState(api.uuid());
  const [pickerSearch, setPickerSearch] = useState("");
  const selected = data?.orders.find((o) => o.id === selectedId);
  const list = sortOrders(
    (data?.orders ?? []).filter(
      (o) =>
        archived(o) === history &&
        `${o.customer_name} ${o.phone} ${o.number}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
  );
  function newOrder() {
    setProblem("");
    setDraft({
      id: api.uuid(),
      customer_name: "",
      phone: "",
      urgent: false,
      due_date: "",
      discount_kind: "amount",
      discount_value: 0,
      items: [],
    });
  }
  function update(patch: Partial<Draft>) {
    setDraft((d) => d && { ...d, ...patch });
  }
  function item(key: string, patch: Partial<OrderItem>) {
    setDraft(
      (d) =>
        d && {
          ...d,
          items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
        },
    );
  }
  async function create() {
    if (!draft) return;
    setBusy(true);
    setProblem("");
    try {
      if (!draft.customer_name.trim())
        throw new Error("Informe o nome do cliente.");
      if (!/^\d{10,13}$/.test(draft.phone.replace(/\D/g, "")))
        throw new Error("Informe telefone com DDD.");
      const date = inputDate(draft.due_date);
      if (date && !validDate(date))
        throw new Error("Informe a entrega no formato DD/MM/AAAA.");
      orderTotal(draft.items, draft.discount_kind, draft.discount_value);
      await api.createOrder({ ...draft, due_date: date || null });
      setDraft(null);
      await reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, stage?: string) {
    if (!selected) return;
    setBusy(true);
    setProblem("");
    try {
      await api.orderAction(selected.id, action, stage);
      setConfirmation(null);
      await reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function payment() {
    if (!selected) return;
    setBusy(true);
    setProblem("");
    try {
      const date = inputDate(paymentDate);
      if (!validDate(date) || date > todaySP())
        throw new Error("Informe uma data de pagamento válida, até hoje.");
      if (amount <= 0 || amount > selected.total_cents - received(selected))
        throw new Error(
          "O pagamento deve ser positivo e não ultrapassar o saldo.",
        );
      await api.pay(selected.id, paymentId, amount, date, paymentNotes);
      setAmount(0);
      setPaymentNotes("");
      setPaymentId(api.uuid());
      await reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  let total = 0,
    totalError = "";
  if (draft?.items.length)
    try {
      total = orderTotal(
        draft.items,
        draft.discount_kind,
        draft.discount_value,
      );
    } catch (e) {
      totalError = errorText(e);
    }
  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        <Heading
          title={
            history ? "Histórias concluídas" : "Cada encomenda, no seu tempo"
          }
          subtitle={
            history
              ? "Pedidos entregues e pagos, além dos cancelados."
              : "Urgentes primeiro. Prazos próximos em destaque. Nenhum detalhe esquecido."
          }
          action={
            !history && (
              <Button label="Nova encomenda" icon="add" onPress={newOrder} />
            )
          }
        />
        <Field
          label="Buscar encomenda"
          placeholder="Cliente, telefone ou número…"
          value={search}
          onChangeText={setSearch}
        />
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
            icon={history ? "checkmark-done-outline" : "receipt-outline"}
            title={
              history ? "Seu histórico começa aqui" : "Tudo em dia por aqui"
            }
            subtitle={
              history
                ? "As encomendas entregues e pagas aparecerão nesta tela."
                : "Cadastre uma encomenda para acompanhar a produção e os pagamentos."
            }
          />
        ) : (
          list.map((o) => (
            <Card key={o.id}>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <View style={{ gap: 7 }}>
                  <Txt small>
                    ENCOMENDA #{String(o.number).padStart(4, "0")} ·{" "}
                    {displayDate(o.created_at)}
                  </Txt>
                  <Txt bold>{o.customer_name}</Txt>
                  <Txt small>
                    {o.items
                      .map((i) => `${i.quantity}× ${i.product_name}`)
                      .join(" · ")}
                  </Txt>
                </View>
                <View style={{ gap: 6 }}>
                  <Txt bold>{money(o.total_cents)}</Txt>
                  <Txt small>Saldo: {money(o.total_cents - received(o))}</Txt>
                </View>
              </View>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <View style={styles.row}>
                  {o.urgent && <Badge label="Urgente" tone="red" />}
                  <Badge
                    label={o.canceled_at ? "Cancelada" : stages[o.stage]}
                    tone={
                      o.canceled_at
                        ? "red"
                        : o.stage === "delivered"
                          ? "green"
                          : "brand"
                    }
                  />
                  {o.due_date && (
                    <Badge
                      label={`Entrega ${displayDate(o.due_date)}`}
                      tone={
                        o.due_date < todaySP() && o.stage !== "delivered"
                          ? "red"
                          : "amber"
                      }
                    />
                  )}
                  {received(o) >= o.total_cents && (
                    <Badge label="Pago" tone="green" />
                  )}
                </View>
                <Button
                  label="Ver encomenda"
                  tone="secondary"
                  onPress={() => {
                    setSelectedId(o.id);
                    setProblem("");
                    setAmount(o.total_cents - received(o));
                    setPaymentDate(displayDate(todaySP()));
                    setPaymentNotes("");
                    setPaymentId(api.uuid());
                  }}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
      <Dialog
        visible={!!draft}
        title="Nova encomenda"
        onClose={() => {
          if (!busy) setDraft(null);
        }}
      >
        {draft && (
          <>
            <Grid>
              <Field
                label="Nome do cliente"
                value={draft.customer_name}
                onChangeText={(customer_name) => update({ customer_name })}
                maxLength={200}
              />
              <Field
                label="Telefone com DDD"
                keyboardType="phone-pad"
                value={draft.phone}
                onChangeText={(phone) => update({ phone })}
              />
            </Grid>
            <Toggle
              label="Esta encomenda é urgente"
              value={draft.urgent}
              onChange={(urgent) => update({ urgent })}
            />
            <Field
              label="Data de entrega (opcional)"
              placeholder="DD/MM/AAAA"
              value={draft.due_date}
              onChangeText={(due_date) => update({ due_date })}
            />
            <Heading
              title="Itens da encomenda"
              subtitle="Selecione produtos e personalize os valores, se necessário."
            />
            <Field
              label="Buscar produto para adicionar"
              placeholder="Nome do produto…"
              value={pickerSearch}
              onChangeText={setPickerSearch}
            />
            <ScrollView
              style={{
                maxHeight: 220,
                backgroundColor: colors.soft,
                borderRadius: 12,
              }}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              nestedScrollEnabled
            >
              {data?.products
                .filter((p) =>
                  p.name.toLowerCase().includes(pickerSearch.toLowerCase()),
                )
                .map((p) => (
                  <View key={p.id} style={{ gap: 5 }}>
                    <Txt bold>{p.name}</Txt>
                    <View style={styles.row}>
                      {p.variants.map((v) => (
                        <Button
                          key={v.id}
                          label={`${v.size} · ${money(v.price_cents)} +`}
                          tone="secondary"
                          onPress={() =>
                            update({
                              items: [
                                ...draft.items,
                                {
                                  key: api.uuid(),
                                  variant_id: v.id,
                                  product_name: p.name,
                                  size: v.size,
                                  price_cents: v.price_cents,
                                  cost_cents: v.cost_cents,
                                  quantity: 1,
                                  notes: "",
                                },
                              ],
                            })
                          }
                        />
                      ))}
                    </View>
                  </View>
                ))}
              {data?.products.length === 0 && (
                <Txt>Cadastre produtos antes de criar uma encomenda.</Txt>
              )}
            </ScrollView>
            {draft.items.map((i) => (
              <Card key={i.key}>
                <Txt bold>
                  {i.product_name} — {i.size}
                </Txt>
                <Grid>
                  <NumberField
                    label="Quantidade"
                    integer
                    value={i.quantity}
                    onChange={(quantity) => item(i.key, { quantity })}
                  />
                  <NumberField
                    label="Preço unitário (R$)"
                    cents
                    value={i.price_cents}
                    onChange={(price_cents) => item(i.key, { price_cents })}
                  />
                </Grid>
                <Field
                  label="Personalização deste item"
                  multiline
                  value={i.notes}
                  onChangeText={(notes) => item(i.key, { notes })}
                />
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Txt bold>{money(i.price_cents * i.quantity)}</Txt>
                  <Button
                    label="Remover item"
                    tone="danger"
                    onPress={() =>
                      update({
                        items: draft.items.filter((x) => x.key !== i.key),
                      })
                    }
                  />
                </View>
              </Card>
            ))}
            <View style={styles.row}>
              <Button
                label="Desconto em R$"
                tone={
                  draft.discount_kind === "amount" ? "primary" : "secondary"
                }
                onPress={() =>
                  update({ discount_kind: "amount", discount_value: 0 })
                }
              />
              <Button
                label="Desconto em %"
                tone={
                  draft.discount_kind === "percent" ? "primary" : "secondary"
                }
                onPress={() =>
                  update({ discount_kind: "percent", discount_value: 0 })
                }
              />
            </View>
            <NumberField
              label={
                draft.discount_kind === "amount"
                  ? "Desconto (R$)"
                  : "Desconto (%)"
              }
              cents={draft.discount_kind === "amount"}
              value={draft.discount_value}
              onChange={(discount_value) => update({ discount_value })}
            />
            {totalError ? (
              <Notice error message={totalError} />
            ) : (
              <Heading
                title={money(total)}
                subtitle={`Lucro estimado: ${money(total - draft.items.reduce((s, i) => s + i.cost_cents * i.quantity, 0))}`}
              />
            )}
            {!!problem && <Notice error message={problem} />}
            <Button
              label="Criar encomenda"
              loading={busy}
              disabled={!draft.items.length || !!totalError}
              onPress={() => void create()}
            />
          </>
        )}
      </Dialog>
      <Dialog
        visible={!!selected}
        title={
          selected
            ? `Encomenda #${String(selected.number).padStart(4, "0")}`
            : ""
        }
        onClose={() => {
          if (!busy) setSelectedId(null);
        }}
      >
        {selected && (
          <>
            <Heading
              title={selected.customer_name}
              subtitle={`${selected.phone} · Entrega: ${displayDate(selected.due_date)}`}
            />
            <View style={styles.row}>
              {selected.urgent && <Badge label="Urgente" tone="red" />}
              <Badge
                label={
                  selected.canceled_at ? "Cancelada" : stages[selected.stage]
                }
              />
            </View>
            {selected.items.map((i) => (
              <Card key={i.id}>
                <Txt bold>
                  {i.quantity}× {i.product_name} — {i.size}
                </Txt>
                <Txt>
                  {money(i.price_cents)} por unidade ·{" "}
                  {money(i.price_cents * i.quantity)}
                </Txt>
                {!!i.notes && <Txt muted>{i.notes}</Txt>}
                <Txt small>
                  Custo registrado: {money(i.cost_cents * i.quantity)}
                </Txt>
              </Card>
            ))}
            <Card>
              <Txt>
                Subtotal:{" "}
                {money(
                  selected.items.reduce(
                    (s, i) => s + i.price_cents * i.quantity,
                    0,
                  ),
                )}
              </Txt>
              <Txt>
                Desconto:{" "}
                {selected.discount_kind === "percent"
                  ? `${selected.discount_value}%`
                  : money(selected.discount_value)}
              </Txt>
              <Txt bold>Total: {money(selected.total_cents)}</Txt>
              <Txt>Recebido: {money(received(selected))}</Txt>
              <Txt bold>
                Saldo: {money(selected.total_cents - received(selected))}
              </Txt>
              <Txt small>
                Lucro estimado:{" "}
                {money(
                  selected.total_cents -
                    selected.items.reduce(
                      (s, i) => s + i.cost_cents * i.quantity,
                      0,
                    ),
                )}
              </Txt>
            </Card>
            {selected.canceled_at ? (
              <Notice
                error
                message={
                  received(selected) > 0
                    ? "Cancelada com pagamento recebido. Combine e registre o acerto financeiro fora do sistema; os pagamentos originais permanecem preservados."
                    : "Esta encomenda foi cancelada."
                }
              />
            ) : (
              <>
                <Txt bold>Etapa de produção</Txt>
                <View style={styles.row}>
                  {(Object.keys(stages) as Stage[]).map((stage) => (
                    <Button
                      key={stage}
                      label={stages[stage]}
                      tone={selected.stage === stage ? "primary" : "secondary"}
                      disabled={busy || selected.stage === stage}
                      onPress={() => void act("stage", stage)}
                    />
                  ))}
                </View>
              </>
            )}
            <Heading
              title="Pagamentos"
              subtitle="Sinais e parcelas ficam registrados nesta encomenda."
            />
            {selected.payments.map((p) => (
              <View
                key={p.id}
                style={[styles.row, { justifyContent: "space-between" }]}
              >
                <View>
                  <Txt bold>{money(p.amount_cents)}</Txt>
                  <Txt small>
                    {displayDate(p.paid_on)}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </Txt>
                </View>
              </View>
            ))}
            {!selected.canceled_at &&
              received(selected) < selected.total_cents && (
                <Card>
                  <NumberField
                    label="Valor recebido (R$)"
                    cents
                    value={amount}
                    onChange={(v) => {
                      setAmount(v);
                      setPaymentId(api.uuid());
                    }}
                  />
                  <Field
                    label="Data do pagamento"
                    placeholder="DD/MM/AAAA"
                    value={paymentDate}
                    onChangeText={(v) => {
                      setPaymentDate(v);
                      setPaymentId(api.uuid());
                    }}
                  />
                  <Field
                    label="Observação do pagamento"
                    value={paymentNotes}
                    onChangeText={(v) => {
                      setPaymentNotes(v);
                      setPaymentId(api.uuid());
                    }}
                  />
                  <Button
                    label="Registrar pagamento"
                    icon="checkmark"
                    loading={busy}
                    onPress={() => void payment()}
                  />
                </Card>
              )}
            {!!problem && <Notice error message={problem} />}
            <View style={styles.row}>
              {archived(selected) && (
                <Button
                  label="Reabrir encomenda"
                  tone="secondary"
                  disabled={busy}
                  onPress={() => setConfirmation("reopen")}
                />
              )}
              {!selected.canceled_at && (
                <Button
                  label="Cancelar encomenda"
                  tone="danger"
                  disabled={busy}
                  onPress={() => setConfirmation("cancel")}
                />
              )}
            </View>
          </>
        )}
      </Dialog>
      <Dialog
        visible={!!confirmation}
        title={
          confirmation === "cancel"
            ? "Cancelar encomenda?"
            : "Reabrir encomenda?"
        }
        onClose={() => setConfirmation(null)}
      >
        <Txt>
          {confirmation === "cancel"
            ? "A encomenda irá para o histórico. Itens e pagamentos serão preservados. Valores recebidos precisarão de acerto manual."
            : "A encomenda voltará para A fazer, preservando itens, valores e pagamentos."}
        </Txt>
        {!!problem && <Notice error message={problem} />}
        <Button
          label="Confirmar"
          tone={confirmation === "cancel" ? "danger" : "primary"}
          loading={busy}
          onPress={() => void act(confirmation!)}
        />
      </Dialog>
    </>
  );
}

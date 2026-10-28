import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as api from "./api";
import { DateField } from "./DateField";
import { deliverySuggestion, productionDuration } from "./production";
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
function EditOrderIcon({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Editar encomenda"
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={({ hovered, pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
        backgroundColor: hovered || pressed ? colors.soft : "transparent",
      })}
    >
      <Ionicons name="create-outline" size={20} color={colors.primary} />
    </Pressable>
  );
}
export function OrdersScreen({ history = false }: { history?: boolean }) {
  const { data, loading, error, reload } = useResource(load);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [estimateNow, setEstimateNow] = useState(() => new Date());
  const formOpen = !!draft;
  useEffect(() => {
    if (!formOpen) return;
    setEstimateNow(new Date());
    const timer = setInterval(() => setEstimateNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [formOpen]);
  const [cardProblem, setCardProblem] = useState("");
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
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
  const delivery = deliverySuggestion(
    (data?.orders ?? []).filter((o) => !editing || o.id !== draft?.id),
    draft?.items ?? [],
    estimateNow,
  );
  function edit(order: Order) {
    setStatusMenuId(null);
    setEditing(true);
    setSelectedId(null);
    setProblem("");
    setDraft({
      ...order,
      due_date: order.due_date ? displayDate(order.due_date) : "",
      items: order.items.map((i) => ({ ...i, key: i.id ?? api.uuid() })),
    });
  }
  async function cardStage(order: Order, stage: Stage) {
    if (busy) return;
    setStatusMenuId(null);
    setBusy(true);
    setCardProblem("");
    try {
      await api.orderAction(order.id, "stage", stage);
      await reload();
    } catch (e) {
      setCardProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function viewOrder(order: Order) {
    setStatusMenuId(null);
    setSelectedId(order.id);
    setProblem("");
    setAmount(order.total_cents - received(order));
    setPaymentDate(displayDate(todaySP()));
    setPaymentNotes("");
    setPaymentId(api.uuid());
  }
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
    setEditing(false);
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
      if (editing) await api.editOrder({ ...draft, due_date: date || null });
      else await api.createOrder({ ...draft, due_date: date || null });
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
        {!!cardProblem && <Notice error message={cardProblem} />}
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
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`Ver encomenda ${o.number} de ${o.customer_name}`}
              onPress={() => viewOrder(o)}
              style={({ hovered, pressed }) => [
                styles.card,
                {
                  borderColor: hovered ? colors.primary : colors.border,
                  backgroundColor: pressed ? colors.bg : "white",
                },
              ]}
            >
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
                  {o.canceled_at && <Badge label="Cancelada" tone="red" />}
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
                <View style={styles.row}>
                  {!o.canceled_at && (
                    <EditOrderIcon disabled={busy} onPress={() => edit(o)} />
                  )}
                </View>
              </View>
              {!o.canceled_at && (
                <View
                  style={{ gap: 4, alignSelf: "flex-start", minWidth: 200 }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Status da encomenda ${o.number}: ${stages[o.stage]}`}
                    accessibilityState={{
                      expanded: statusMenuId === o.id,
                      disabled: busy,
                    }}
                    disabled={busy}
                    onPress={(event) => {
                      event.stopPropagation();
                      setStatusMenuId(statusMenuId === o.id ? null : o.id);
                    }}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      backgroundColor: colors.soft,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <Txt small>Status: {stages[o.stage]}</Txt>
                    <Ionicons
                      name={
                        statusMenuId === o.id ? "chevron-up" : "chevron-down"
                      }
                      size={16}
                      color={colors.primary}
                    />
                  </Pressable>
                  {statusMenuId === o.id && (
                    <View
                      accessibilityRole="menu"
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {(Object.keys(stages) as Stage[]).map((stage) => (
                        <Pressable
                          key={stage}
                          accessibilityRole="menuitem"
                          accessibilityLabel={stages[stage]}
                          accessibilityState={{ selected: o.stage === stage }}
                          disabled={busy}
                          onPress={(event) => {
                            event.stopPropagation();
                            if (o.stage === stage) setStatusMenuId(null);
                            else void cardStage(o, stage);
                          }}
                          style={({ hovered, pressed }) => ({
                            minHeight: 44,
                            paddingHorizontal: 12,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            backgroundColor:
                              hovered || pressed || o.stage === stage
                                ? colors.soft
                                : "white",
                          })}
                        >
                          <Txt>{stages[stage]}</Txt>
                          {o.stage === stage && (
                            <Ionicons
                              name="checkmark"
                              size={17}
                              color={colors.primary}
                            />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
      <Dialog
        visible={!!draft}
        title={editing ? "Editar encomenda" : "Nova encomenda"}
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
            <DateField
              label="Data de entrega (opcional)"
              value={draft.due_date}
              onChange={(due_date) => update({ due_date })}
            />
            <Card>
              <Txt bold>Sugestão de entrega · Impressão das 8h às 22h</Txt>
              <Txt small>
                Fila: {delivery.queuedOrders} pedido(s) ·{" "}
                {productionDuration(delivery.queueMinutes)}. Novo pedido:{" "}
                {productionDuration(delivery.newMinutes)}.
              </Txt>
              {delivery.date ? (
                <>
                  <Txt bold>
                    Entrega sugerida: {displayDate(delivery.date)} às{" "}
                    {delivery.time}
                  </Txt>
                  <Button
                    label="Usar data sugerida"
                    icon="calendar-outline"
                    tone="secondary"
                    onPress={() =>
                      update({ due_date: displayDate(delivery.date!) })
                    }
                  />
                </>
              ) : (
                <Txt small>
                  {delivery.missing
                    ? "Há pedidos sem tempo de produção registrado. Execute o SQL de atualização para calcular a fila completa."
                    : "Adicione itens com tempo de produção cadastrado para calcular a sugestão."}
                </Txt>
              )}
              <Txt small>
                Uma impressora, todos os dias, das 8h às 22h (horário de São
                Paulo). Hoje restam{" "}
                {productionDuration(delivery.availableToday)} disponíveis. O
                cálculo parte do horário atual e continua às 8h do dia seguinte
                quando necessário. Pedidos a fazer e em produção entram com o
                tempo completo; prontos, entregues e cancelados não entram. A
                estimativa não desconta horas já impressas e não inclui
                acabamento ou transporte. Você pode escolher outra data.
              </Txt>
              {delivery.date &&
                validDate(inputDate(draft.due_date)) &&
                inputDate(draft.due_date) < delivery.date && (
                  <Notice message="A data escolhida está antes da estimativa de produção da fila." />
                )}
            </Card>
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
                                  production_minutes: v.minutes,
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
              label={editing ? "Salvar alterações" : "Criar encomenda"}
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
            {!selected.canceled_at && (
              <EditOrderIcon disabled={busy} onPress={() => edit(selected)} />
            )}
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

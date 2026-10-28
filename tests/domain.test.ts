import test from "node:test";
import assert from "node:assert/strict";
import { displayDate } from "../src/domain";
import {
  archived,
  costBreakdown,
  defaultSettings,
  Order,
  orderTotal,
  priority,
  sortOrders,
  suggestedPrice,
  todaySP,
  validDate,
  whatsappUrl,
} from "../src/domain";
const order = (patch: Partial<Order> = {}): Order => ({
  id: "test",
  number: 1,
  customer_name: "Cliente",
  phone: "19999999999",
  urgent: false,
  due_date: null,
  stage: "todo",
  canceled_at: null,
  created_at: "2026-10-01T12:00:00Z",
  total_cents: 2000,
  discount_kind: "amount",
  discount_value: 0,
  items: [],
  payments: [],
  ...patch,
});
test("custo soma material, horas, embalagens, desgaste e extras em centavos", () => {
  assert.equal(
    costBreakdown(
      { grams: 125.79, minutes: 8 * 60 + 39, extras_cents: 0 },
      defaultSettings,
    ).total,
    1677,
  );
  const s = {
    ...defaultSettings,
    energy_hour_cents: 200,
    box_cents: 100,
    label_cents: 30,
  };
  assert.equal(
    costBreakdown({ grams: 100, minutes: 90, extras_cents: 50 }, s).total,
    1848,
  );
});
test("preço arredonda sempre para cima em ,90, inclusive nas fronteiras", () => {
  assert.equal(suggestedPrice(1000, 100), 2090);
  assert.equal(suggestedPrice(1045, 100), 2090);
  assert.equal(suggestedPrice(1046, 100), 2190);
  assert.equal(suggestedPrice(0, 100), 90);
  for (let c = 0; c < 10000; c += 13) {
    const price = suggestedPrice(c, 125.5);
    assert.equal(price % 100, 90);
    assert.ok(price >= c * 2.255 - 1e-7);
    assert.ok(price - 100 < c * 2.255 + 1e-7);
  }
});
test("descontos, quantidades e valores inválidos são rejeitados", () => {
  const items = [{ quantity: 3, price_cents: 1990 }];
  assert.equal(orderTotal(items, "amount", 970), 5000);
  assert.equal(orderTotal(items, "percent", 10), 5373);
  assert.throws(() => orderTotal(items, "amount", 6000));
  assert.throws(() => orderTotal(items, "percent", 101));
  assert.throws(() =>
    orderTotal([{ quantity: 1.5, price_cents: 100 }], "amount", 0),
  );
  assert.throws(() => orderTotal([], "amount", 0));
});
test("fila prioriza urgentes, depois vencidas e até dois dias, mantendo criação", () => {
  const today = "2026-10-24";
  assert.equal(priority(order({ urgent: true }), today), 0);
  for (const due_date of ["2026-10-23", "2026-10-24", "2026-10-26"])
    assert.equal(priority(order({ due_date }), today), 1);
  assert.equal(priority(order({ due_date: "2026-10-27" }), today), 2);
  const a = order({ id: "normal" });
  const b = order({
    id: "urgente",
    urgent: true,
    created_at: "2026-10-22T12:00:00Z",
  });
  const c = order({ id: "prazo", due_date: "2026-10-24" });
  assert.deepEqual(
    sortOrders([a, c, b], today).map((o) => o.id),
    ["urgente", "prazo", "normal"],
  );
});
test("somente entregue e integralmente pago é arquivado, ou cancelado", () => {
  const payments = [
    { id: "1", amount_cents: 1000, paid_on: "2026-10-24", notes: "" },
  ];
  assert.equal(archived(order({ stage: "delivered", payments })), false);
  const paid = [...payments, { ...payments[0]!, id: "2" }];
  assert.equal(archived(order({ stage: "ready", payments: paid })), false);
  assert.equal(archived(order({ stage: "delivered", payments: paid })), true);
  assert.equal(archived(order({ canceled_at: "2026-10-24" })), true);
});
test("datas usam calendário de São Paulo e rejeitam datas inexistentes", () => {
  assert.equal(todaySP(new Date("2026-10-25T01:00:00Z")), "2026-10-24");
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
});
test("datas de criação respeitam São Paulo sem alterar datas de entrega", () => {
  assert.equal(displayDate("2026-10-25T01:00:00Z"), "24/10/2026");
  assert.equal(displayDate("2026-10-25"), "25/10/2026");
});
test("WhatsApp tem destino, variação, quantidade, notas e total corretos", () => {
  const url = whatsappUrl([
    {
      key: "1",
      product_id: "1",
      variant_id: "1",
      name: "Vaso",
      size: "10 cm",
      quantity: 2,
      notes: "Azul & branco",
      price_cents: 2090,
    },
  ]);
  assert.ok(url.startsWith("https://wa.me/5519995203113?text="));
  const message = decodeURIComponent(url.split("text=")[1]!);
  assert.ok(message.includes("2 × Vaso — 10 cm"));
  assert.ok(message.includes("Azul & branco"));
  assert.ok(message.includes("41,80"));
});

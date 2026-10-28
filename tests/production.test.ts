import test from "node:test";
import assert from "node:assert/strict";
import { Order, OrderItem } from "../src/domain";
import {
  deliverySuggestion,
  totalProductionMinutes,
  productionProgress,
} from "../src/production";
const item = (minutes: number, quantity = 1): OrderItem => ({
  variant_id: "v",
  product_name: "Peça",
  size: "P",
  quantity,
  price_cents: 100,
  cost_cents: 50,
  notes: "",
  production_minutes: minutes,
});
const order = (
  stage: Order["stage"],
  items: OrderItem[],
  canceled = false,
): Order => ({
  id: "o",
  number: 1,
  customer_name: "Cliente",
  phone: "19999999999",
  urgent: false,
  due_date: null,
  stage,
  canceled_at: canceled ? "2026-10-28" : null,
  created_at: "2026-10-28",
  total_cents: 100,
  discount_kind: "amount",
  discount_value: 0,
  items,
  payments: [],
});
test("tempo total no card soma quantidades e inclui itens já feitos", () => {
  assert.equal(
    totalProductionMinutes([item(90, 2), { ...item(45, 3), completed: true }]),
    315,
  );
  assert.equal(
    totalProductionMinutes([{ ...item(60), production_minutes: undefined }]),
    null,
  );
  assert.equal(totalProductionMinutes([item(0)]), 0);
});
test("progresso conta unidades e desconta produção parcial do prazo", () => {
  const partial = { ...item(60, 10), produced_quantity: 3 };
  assert.deepEqual(productionProgress([partial]), {
    total: 10,
    done: 3,
    percent: 30,
  });
  assert.equal(
    productionProgress([{ ...partial, produced_quantity: 10 }]).percent,
    100,
  );
  const result = deliverySuggestion(
    [order("printing", [partial])],
    [item(60)],
    new Date("2026-10-28T08:00:00-03:00"),
  );
  assert.equal(result.queueMinutes, 420);
  assert.equal(result.time, "16:00");
});
test("entrega: soma fila e quantidades, exclui prontos/entregues/cancelados", () => {
  const result = deliverySuggestion(
    [
      order("todo", [item(300, 2)]),
      order("printing", [item(180)]),
      order("ready", [item(9999)]),
      order("delivered", [item(9999)]),
      order("todo", [item(9999)], true),
    ],
    [item(390, 2)],
    new Date("2026-10-28T08:00:00-03:00"),
  );
  assert.equal(result.queueMinutes, 780);
  assert.equal(result.newMinutes, 780);
  assert.equal(result.days, 2);
  assert.equal(result.date, "2026-10-29");
});
test("entrega: janela de 14h, dias corridos e virada de mês", () => {
  assert.equal(
    deliverySuggestion([], [item(840)], new Date("2026-10-31T08:00:00-03:00"))
      .date,
    "2026-10-31",
  );
  assert.equal(
    deliverySuggestion([], [item(841)], new Date("2026-10-31T08:00:00-03:00"))
      .date,
    "2026-11-01",
  );
  assert.equal(
    deliverySuggestion([], [item(1681)], new Date("2026-12-31T08:00:00-03:00"))
      .date,
    "2027-01-02",
  );
});
test("entrega: considera hora da venda, início às 8h e pausa às 22h", () => {
  const before = deliverySuggestion(
    [],
    [item(60)],
    new Date("2026-10-28T06:30:00-03:00"),
  );
  assert.equal(before.date, "2026-10-28");
  assert.equal(before.time, "09:00");
  const exact = deliverySuggestion(
    [],
    [item(120)],
    new Date("2026-10-28T20:00:00-03:00"),
  );
  assert.equal(exact.date, "2026-10-28");
  assert.equal(exact.time, "22:00");
  const next = deliverySuggestion(
    [],
    [item(180)],
    new Date("2026-10-28T20:00:00-03:00"),
  );
  assert.equal(next.date, "2026-10-29");
  assert.equal(next.time, "09:00");
  const closed = deliverySuggestion(
    [],
    [item(60)],
    new Date("2026-10-28T22:00:00-03:00"),
  );
  assert.equal(closed.date, "2026-10-29");
  assert.equal(closed.time, "09:00");
  const late = deliverySuggestion(
    [],
    [item(60)],
    new Date("2026-10-29T02:30:00Z"),
  );
  assert.equal(late.date, "2026-10-29");
  assert.equal(late.time, "09:00"); // Ainda é 23h30 do dia 28 em São Paulo.
});
test("entrega: fila consome as horas de hoje e segundos não antecipam término", () => {
  const result = deliverySuggestion(
    [order("todo", [item(90)])],
    [item(60)],
    new Date("2026-10-28T20:00:00-03:00"),
  );
  assert.equal(result.date, "2026-10-29");
  assert.equal(result.time, "08:30");
  const seconds = deliverySuggestion(
    [],
    [item(1)],
    new Date("2026-10-28T21:59:30-03:00"),
  );
  assert.equal(seconds.date, "2026-10-29");
  assert.equal(seconds.time, "08:01");
});
test("entrega: sem itens, sem tempo ou fila incompleta não inventa uma data", () => {
  assert.equal(deliverySuggestion([], []).date, null);
  assert.equal(deliverySuggestion([], [item(0)]).date, null);
  const unknown = { ...item(60), production_minutes: undefined };
  const result = deliverySuggestion([order("todo", [unknown])], [item(60)]);
  assert.equal(result.missing, true);
  assert.equal(result.date, null);
});
test("entrega: itens já feitos não ocupam a fila de impressão", () => {
  const result = deliverySuggestion(
    [order("printing", [{ ...item(1000), completed: true }, item(60)])],
    [item(60)],
    new Date("2026-10-28T20:00:00-03:00"),
  );
  assert.equal(result.queueMinutes, 60);
  assert.equal(result.date, "2026-10-28");
  assert.equal(result.time, "22:00");
});

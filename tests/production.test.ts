import test from "node:test";
import assert from "node:assert/strict";
import { Order, OrderItem } from "../src/domain";
import { deliverySuggestion } from "../src/production";
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
    "2026-10-28",
  );
  assert.equal(result.queueMinutes, 780);
  assert.equal(result.newMinutes, 780);
  assert.equal(result.days, 2);
  assert.equal(result.date, "2026-10-29");
});
test("entrega: limite de 13h, dias corridos e virada de mês", () => {
  assert.equal(
    deliverySuggestion([], [item(780)], "2026-10-31").date,
    "2026-10-31",
  );
  assert.equal(
    deliverySuggestion([], [item(781)], "2026-10-31").date,
    "2026-11-01",
  );
  assert.equal(
    deliverySuggestion([], [item(1561)], "2026-12-31").date,
    "2027-01-02",
  );
});
test("entrega: sem itens, sem tempo ou fila incompleta não inventa uma data", () => {
  assert.equal(deliverySuggestion([], []).date, null);
  assert.equal(deliverySuggestion([], [item(0)]).date, null);
  const unknown = { ...item(60), production_minutes: undefined };
  const result = deliverySuggestion([order("todo", [unknown])], [item(60)]);
  assert.equal(result.missing, true);
  assert.equal(result.date, null);
});

export type Settings = {
  id?: number;
  pla_kg_cents: number;
  energy_hour_cents: number;
  box_cents: number;
  label_cents: number;
  bag_cents: number;
  wear_cents: number;
  markup_percent: number;
};
export const defaultSettings: Settings = {
  pla_kg_cents: 12000,
  energy_hour_cents: 0,
  box_cents: 0,
  label_cents: 0,
  bag_cents: 18,
  wear_cents: 150,
  markup_percent: 100,
};
export type Variant = {
  id: string;
  product_id?: string;
  size: string;
  grams: number;
  minutes: number;
  extras_cents: number;
  cost_cents: number;
  price_cents: number;
  automatic: boolean;
  active?: boolean;
};
export type Photo = {
  id: string;
  product_id: string;
  path: string;
  position: number;
};
export type PrintFile = {
  id: string;
  product_id: string;
  path: string;
  name: string;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  category_id: string | null;
  category_ids?: string[];
  published: boolean;
  variants: Variant[];
  photos: Photo[];
  files: PrintFile[];
};
export type Category = { id: string; name: string };
export type CatalogProduct = {
  demand_rank?: number;
  id: string;
  name: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  categories?: Category[];
  photos: { path: string; position: number }[];
  variants: { id: string; size: string; price_cents: number }[];
};
export type CartItem = {
  key: string;
  product_id: string;
  variant_id: string;
  name: string;
  size: string;
  price_cents: number;
  quantity: number;
  notes: string;
};
export type Stage = "todo" | "printing" | "ready" | "delivered";
export const stages: Record<Stage, string> = {
  todo: "A fazer",
  printing: "Em produção",
  ready: "Pronto",
  delivered: "Entregue",
};
export type OrderItem = {
  produced_quantity?: number;
  completed?: boolean;
  production_minutes?: number;
  id?: string;
  variant_id: string;
  product_name: string;
  size: string;
  quantity: number;
  price_cents: number;
  cost_cents: number;
  notes: string;
};
export type Payment = {
  id: string;
  amount_cents: number;
  paid_on: string;
  notes: string;
};
export type Order = {
  id: string;
  number: number;
  customer_name: string;
  phone: string;
  urgent: boolean;
  due_date: string | null;
  stage: Stage;
  canceled_at: string | null;
  created_at: string;
  total_cents: number;
  discount_kind: "amount" | "percent";
  discount_value: number;
  items: OrderItem[];
  payments: Payment[];
};

export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function decimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}
export function parseMoney(value: string): number {
  return Math.round(decimal(value) * 100);
}
export function costBreakdown(
  v: Pick<Variant, "grams" | "minutes" | "extras_cents">,
  s: Settings,
) {
  const material = (v.grams / 1000) * s.pla_kg_cents;
  const energy = (v.minutes / 60) * s.energy_hour_cents;
  const packaging = s.box_cents + s.label_cents + s.bag_cents;
  return {
    material,
    energy,
    packaging,
    wear: s.wear_cents,
    extras: v.extras_cents,
    total: Math.round(
      material + energy + packaging + s.wear_cents + v.extras_cents,
    ),
  };
}
export function suggestedPrice(costCents: number, markup: number): number {
  if (
    !Number.isFinite(costCents) ||
    costCents < 0 ||
    !Number.isFinite(markup) ||
    markup < 0
  )
    throw new Error("Custo e acréscimo devem ser válidos e não negativos.");
  // Subtract epsilon only to neutralize floating point noise at an exact ,90 boundary.
  return Math.max(
    90,
    Math.ceil((costCents * (1 + markup / 100) - 90) / 100 - 1e-9) * 100 + 90,
  );
}
export function orderTotal(
  items: Pick<OrderItem, "quantity" | "price_cents">[],
  kind: "amount" | "percent",
  discount: number,
): number {
  if (
    !items.length ||
    items.some(
      (i) =>
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        !Number.isSafeInteger(i.price_cents) ||
        i.price_cents < 0,
    )
  )
    throw new Error("Informe itens, quantidades e preços válidos.");
  const subtotal = items.reduce(
    (sum, i) => sum + i.quantity * i.price_cents,
    0,
  );
  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    (kind === "percent" && discount > 100) ||
    (kind === "amount" && (!Number.isInteger(discount) || discount > subtotal))
  )
    throw new Error("O desconto não pode ultrapassar o total.");
  return (
    subtotal -
    (kind === "percent" ? Math.round((subtotal * discount) / 100) : discount)
  );
}
export const received = (o: Pick<Order, "payments">) =>
  o.payments.reduce((s, p) => s + p.amount_cents, 0);
export const archived = (o: Order) =>
  !!o.canceled_at || (o.stage === "delivered" && received(o) >= o.total_cents);
export function todaySP(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function priority(
  o: Pick<Order, "urgent" | "due_date">,
  today = todaySP(),
): number {
  return o.urgent ? 0 : o.due_date && o.due_date <= addDays(today, 2) ? 1 : 2;
}
export function sortOrders(orders: Order[], today = todaySP()) {
  return [...orders].sort(
    (a, b) =>
      priority(a, today) - priority(b, today) ||
      a.created_at.localeCompare(b.created_at) ||
      a.number - b.number,
  );
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function displayDate(value: string | null): string {
  if (!value) return "Sem prazo";
  const date = value.includes("T") ? todaySP(new Date(value)) : value;
  return date.slice(0, 10).split("-").reverse().join("/");
}
export function inputDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
export function whatsappUrl(items: CartItem[]) {
  const lines = items.map(
    (i) =>
      `• ${i.quantity} × ${i.name} — ${i.size}\n  ${money(i.price_cents)} cada · ${money(i.price_cents * i.quantity)}${i.notes.trim() ? `\n  Personalização: ${i.notes.trim()}` : ""}`,
  );
  const total = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  return `https://wa.me/5519995203113?text=${encodeURIComponent(`Olá! Gostaria de encomendar na INNEXA 3D:\n\n${lines.join("\n\n")}\n\nTotal do catálogo: ${money(total)}\nPodemos confirmar os detalhes e o prazo?`)}`;
}

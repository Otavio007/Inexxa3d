import { Order, OrderItem, addDays, todaySP } from "./domain";

export const PRINT_OPEN_MINUTE = 8 * 60;
export const PRINT_CLOSE_MINUTE = 22 * 60;
export const DAILY_PRINT_MINUTES = PRINT_CLOSE_MINUTE - PRINT_OPEN_MINUTE;
// Usa o relógio de São Paulo, independentemente do fuso do dispositivo.
export function deliverySuggestion(
  orders: Order[],
  items: OrderItem[],
  now = new Date(),
) {
  let missing = false;
  function duration(rows: OrderItem[]) {
    return rows.reduce((sum, item) => {
      if (item.completed) return sum;
      if (
        item.production_minutes == null ||
        !Number.isFinite(item.production_minutes) ||
        item.production_minutes < 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        missing = true;
        return sum;
      }
      return sum + item.production_minutes * item.quantity;
    }, 0);
  }
  const queued = orders.filter(
    (o) => !o.canceled_at && (o.stage === "todo" || o.stage === "printing"),
  );
  const queueMinutes = queued.reduce(
    (sum, order) => sum + duration(order.items),
    0,
  );
  const newMinutes = duration(items);
  const today = todaySP(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Arredonda para o próximo minuto para não prometer antes do término.
  const minuteNow =
    get("hour") * 60 +
    get("minute") +
    (get("second") > 0 || now.getMilliseconds() > 0 ? 1 : 0);
  const startMinute = Math.max(PRINT_OPEN_MINUTE, minuteNow);
  const availableToday = Math.max(0, PRINT_CLOSE_MINUTE - startMinute);
  const total = queueMinutes + newMinutes;
  let offset = 0;
  let finishMinute: number;
  if (total <= availableToday && availableToday > 0) {
    finishMinute = startMinute + total;
  } else {
    const remaining = Math.max(0, total - availableToday);
    offset = Math.max(1, Math.ceil(remaining / DAILY_PRINT_MINUTES));
    finishMinute =
      PRINT_OPEN_MINUTE + remaining - (offset - 1) * DAILY_PRINT_MINUTES;
  }
  const canSuggest = !missing && items.length > 0 && newMinutes > 0;
  return {
    queueMinutes,
    newMinutes,
    days: offset + 1,
    availableToday,
    queuedOrders: queued.length,
    date: canSuggest ? addDays(today, offset) : null,
    time: canSuggest
      ? `${String(Math.floor(finishMinute / 60)).padStart(2, "0")}:${String(finishMinute % 60).padStart(2, "0")}`
      : null,
    missing,
  };
}
export function productionDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
export function totalProductionMinutes(items: OrderItem[]): number | null {
  let total = 0;
  for (const item of items) {
    if (
      item.production_minutes == null ||
      !Number.isInteger(item.production_minutes) ||
      item.production_minutes < 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
      return null;
    total += item.production_minutes * item.quantity;
  }
  return total;
}

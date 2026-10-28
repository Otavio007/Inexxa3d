import { Order, OrderItem, addDays, todaySP } from "./domain";

export const DAILY_PRINT_MINUTES = 13 * 60;
// Uma impressora, dias corridos, contando hoje como o primeiro dia disponível.
export function deliverySuggestion(
  orders: Order[],
  items: OrderItem[],
  today = todaySP(),
) {
  let missing = false;
  function duration(rows: OrderItem[]) {
    return rows.reduce((sum, item) => {
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
  const days = Math.max(
    1,
    Math.ceil((queueMinutes + newMinutes) / DAILY_PRINT_MINUTES),
  );
  return {
    queueMinutes,
    newMinutes,
    days,
    queuedOrders: queued.length,
    date:
      missing || !items.length || newMinutes === 0
        ? null
        : addDays(today, days - 1),
    missing,
  };
}
export function productionDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

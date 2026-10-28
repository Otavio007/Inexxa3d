import * as Crypto from "expo-crypto";
import { check, supabase } from "./supabase";
import { Category, Order, Product, Settings, CatalogProduct } from "./domain";

export const uuid = () => Crypto.randomUUID();
// PostgREST caps each response. Fetch all pages so old unpaid orders are not lost.
async function all<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await query(from, from + 999));
    result.push(...page);
    if (page.length < 1000) return result;
  }
}
export async function catalog(): Promise<CatalogProduct[]> {
  return all<CatalogProduct>((from, to) =>
    supabase
      .from("catalog")
      .select("*")
      .order("demand_rank", { ascending: true })
      .order("name")
      .order("id")
      .range(from, to),
  );
}
export async function products(): Promise<Product[]> {
  return (
    await all<Product>((from, to) =>
      supabase
        .from("products")
        .select(
          "*,variants:product_variants(*),photos:product_photos(*),files:product_files(*)",
        )
        .order("name")
        .order("id")
        .range(from, to),
    )
  )
    .map((p: Product) => ({
      ...p,
      variants: p.variants.filter((v) => v.active !== false),
      photos: p.photos.sort((a, b) => a.position - b.position),
    }))
    .filter((p) => p.variants.length > 0);
}
export async function categories(): Promise<Category[]> {
  return all<Category>((from, to) =>
    supabase
      .from("categories")
      .select("*")
      .order("name")
      .order("id")
      .range(from, to),
  );
}
export async function settings(): Promise<Settings> {
  return check(
    await supabase.from("settings").select("*").eq("id", 1).single(),
  ) as Settings;
}
export async function orders(): Promise<Order[]> {
  return all<Order>((from, to) =>
    supabase
      .from("orders")
      .select("*,items:order_items(*),payments(*)")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
}
export async function saveProduct(product: Product) {
  return check(await supabase.rpc("save_product", { p_product: product }));
}
export async function deleteProduct(id: string) {
  return check(await supabase.rpc("delete_product", { p_id: id }));
}
export async function saveSettings(value: Settings) {
  return check(await supabase.rpc("save_settings", { p_settings: value }));
}
export async function createOrder(order: Record<string, unknown>) {
  return check(await supabase.rpc("create_order", { p_order: order }));
}
export async function editOrder(order: Record<string, unknown>) {
  return check(await supabase.rpc("edit_order", { p_order: order }));
}
export async function setItemCompleted(itemId: string, completed: boolean) {
  return check(
    await supabase.rpc("set_item_completed", {
      p_item_id: itemId,
      p_completed: completed,
    }),
  );
}
export async function orderAction(id: string, action: string, stage?: string) {
  return check(
    await supabase.rpc("order_action", {
      p_id: id,
      p_action: action,
      p_stage: stage ?? null,
    }),
  );
}
export async function pay(
  id: string,
  paymentId: string,
  amount: number,
  date: string,
  notes: string,
) {
  return check(
    await supabase.rpc("record_payment", {
      p_order_id: id,
      p_id: paymentId,
      p_amount: amount,
      p_date: date,
      p_notes: notes,
    }),
  );
}
export async function addCategory(name: string): Promise<Category> {
  return check(
    await supabase.from("categories").insert({ name }).select().single(),
  );
}
export async function upload(
  productId: string,
  name: string,
  bytes: ArrayBuffer,
  mime: string,
  image: boolean,
  position = 0,
) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (
    image
      ? !["jpg", "jpeg", "png", "webp"].includes(ext)
      : !["stl", "3mf", "obj"].includes(ext)
  )
    throw new Error(
      image
        ? "Use uma imagem JPG, PNG ou WebP."
        : "Use um arquivo STL, 3MF ou OBJ.",
    );
  const limit = image ? 10 : 100;
  if (bytes.byteLength > limit * 1024 * 1024)
    throw new Error(`O limite é ${limit} MB por arquivo.`);
  const bucket = image ? "product-images" : "print-files";
  const path = `${productId}/${uuid()}.${ext}`;
  check(
    await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: image ? mime : "application/octet-stream",
      upsert: false,
    }),
  );
  const result = await supabase
    .from(image ? "product_photos" : "product_files")
    .insert(
      image
        ? { product_id: productId, path, position }
        : { product_id: productId, path, name },
    )
    .select()
    .single();
  if (result.error) {
    await supabase.storage.from(bucket).remove([path]);
    throw result.error;
  }
  return result.data;
}
export async function removeAsset(
  asset: { id: string; path: string },
  image: boolean,
) {
  check(
    await supabase.storage
      .from(image ? "product-images" : "print-files")
      .remove([asset.path]),
  );
  check(
    await supabase
      .from(image ? "product_photos" : "product_files")
      .delete()
      .eq("id", asset.id),
  );
}
export async function downloadFile(path: string) {
  return check(
    await supabase.storage.from("print-files").createSignedUrl(path, 60),
  ).signedUrl;
}

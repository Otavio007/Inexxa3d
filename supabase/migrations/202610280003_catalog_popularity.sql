create index if not exists order_items_variant on public.order_items(variant_id);

-- Expõe somente a posição no ranking, sem quantidades ou dados de clientes.
create or replace view public.catalog with (security_barrier = true) as
select p.id,p.name,p.description,p.category_id,c.name as category_name,
  coalesce((select jsonb_agg(jsonb_build_object('path',ph.path,'position',ph.position) order by ph.position,ph.id) from public.product_photos ph where ph.product_id=p.id),'[]'::jsonb) as photos,
  (select jsonb_agg(jsonb_build_object('id',v.id,'size',v.size,'price_cents',v.price_cents) order by v.price_cents,v.id) from public.product_variants v where v.product_id=p.id and v.active) as variants,
  coalesce((select jsonb_agg(jsonb_build_object('id',cc.id,'name',cc.name) order by cc.name) from public.categories cc where cc.id=any(p.category_ids)),'[]'::jsonb) as categories,
  dense_rank() over(order by coalesce(demand.units,0) desc) as demand_rank
from public.products p
left join public.categories c on c.id=p.category_id
left join (
  select pv.product_id,sum(oi.quantity::bigint) as units
  from public.order_items oi
  join public.orders o on o.id=oi.order_id and o.canceled_at is null
  join public.product_variants pv on pv.id=oi.variant_id
  group by pv.product_id
) demand on demand.product_id=p.id
where p.published and exists(select 1 from public.product_variants v where v.product_id=p.id and v.active);
notify pgrst, 'reload schema';

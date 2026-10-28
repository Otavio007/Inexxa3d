alter table public.products add column if not exists category_ids uuid[] not null default '{}';
update public.products set category_ids=array[category_id] where category_id is not null and cardinality(category_ids)=0;

create or replace function public.save_product(p_product jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; v jsonb; vid uuid; c integer;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 -- Serialize product edits with settings changes so committed costs use one configuration.
 perform 1 from settings where id=1 for update;
 pid := (p_product->>'id')::uuid;
 if jsonb_typeof(p_product->'variants') is distinct from 'array' or jsonb_array_length(p_product->'variants')<1 then raise exception 'Adicione ao menos um tamanho'; end if;
 if (select count(*) from jsonb_array_elements(p_product->'variants')) <> (select count(distinct x->>'id') from jsonb_array_elements(p_product->'variants') x) then raise exception 'Tamanhos duplicados'; end if;
 insert into products(id,name,description,category_id,published) values(pid,trim(p_product->>'name'),coalesce(p_product->>'description',''),nullif(p_product->>'category_id','')::uuid,coalesce((p_product->>'published')::boolean,false))
 on conflict(id) do update set name=excluded.name,description=excluded.description,category_id=excluded.category_id,published=excluded.published;
 update product_variants set active=false where product_id=pid;
 for v in select * from jsonb_array_elements(p_product->'variants') loop
   vid := (v->>'id')::uuid;
   if exists(select 1 from product_variants where id=vid and product_id<>pid) then raise exception 'Tamanho pertence a outro produto'; end if;
   c := variant_cost((v->>'grams')::numeric,(v->>'minutes')::integer,(v->>'extras_cents')::integer);
   insert into product_variants(id,product_id,size,grams,minutes,extras_cents,cost_cents,price_cents,automatic,active)
   values(vid,pid,trim(v->>'size'),(v->>'grams')::numeric,(v->>'minutes')::integer,(v->>'extras_cents')::integer,c,
    case when (v->>'automatic')::boolean then suggested_price(c) else (v->>'price_cents')::integer end,(v->>'automatic')::boolean,true)
   on conflict(id) do update set size=excluded.size,grams=excluded.grams,minutes=excluded.minutes,extras_cents=excluded.extras_cents,cost_cents=excluded.cost_cents,price_cents=excluded.price_cents,automatic=excluded.automatic,active=true;
 end loop;
 if p_product ? 'category_ids' then
   if jsonb_typeof(p_product->'category_ids') is distinct from 'array' then raise exception 'Categorias inválidas'; end if;
   if exists(select 1 from jsonb_array_elements_text(p_product->'category_ids') x(id)
      where not exists(select 1 from categories c where c.id=x.id::uuid)) then raise exception 'Categoria inexistente'; end if;
   update products set category_ids=array(select distinct x::uuid from jsonb_array_elements_text(p_product->'category_ids') x),
     category_id=(p_product->'category_ids'->>0)::uuid where id=pid;
 else
   update products set category_ids=case when category_id is null then '{}'::uuid[] else array[category_id] end where id=pid;
 end if;
 return pid;
end $$;

create or replace view public.catalog with (security_barrier = true) as
select p.id,p.name,p.description,p.category_id,c.name as category_name,
  coalesce((select jsonb_agg(jsonb_build_object('path',ph.path,'position',ph.position) order by ph.position,ph.id) from public.product_photos ph where ph.product_id=p.id),'[]'::jsonb) as photos,
  (select jsonb_agg(jsonb_build_object('id',v.id,'size',v.size,'price_cents',v.price_cents) order by v.price_cents,v.id) from public.product_variants v where v.product_id=p.id and v.active) as variants,
  coalesce((select jsonb_agg(jsonb_build_object('id',cc.id,'name',cc.name) order by cc.name) from public.categories cc where cc.id=any(p.category_ids)),'[]'::jsonb) as categories
from public.products p left join public.categories c on c.id=p.category_id
where p.published and exists(select 1 from public.product_variants v where v.product_id=p.id and v.active);
notify pgrst, 'reload schema';

-- ============================================================
-- Shop Manager — Supabase schema
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query > paste > Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- PROFILES (one row per staff login, linked to Supabase Auth) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'pending'
    check (role in ('pending','admin','cashier','inventory_manager')),
  created_at timestamptz default now()
);

-- auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'pending');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- SUPPLIERS ----------
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz default now()
);

-- ---------- PRODUCTS (inventory) ----------
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  sku text unique,
  name text not null,
  category text,
  brand text,
  cost_price numeric(10,2) not null default 0,
  sale_price numeric(10,2) not null default 0,
  quantity int not null default 0,
  low_stock_threshold int not null default 3,
  supplier_id uuid references suppliers(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- PURCHASING ----------
create table if not exists purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid references suppliers(id),
  status text not null default 'pending' check (status in ('pending','received','cancelled')),
  total_cost numeric(10,2) not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  received_at timestamptz
);

create table if not exists purchase_order_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  product_id uuid references products(id),
  quantity int not null check (quantity > 0),
  unit_cost numeric(10,2) not null default 0
);

-- ---------- SALES ----------
create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  invoice_no text unique not null,
  customer_name text,
  customer_phone text,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null check (payment_method in ('cash','debit','credit','bank','tabby','tamara')),
  installments int,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

-- ============================================================
-- Helper: current user's role (bypasses RLS internally, safe to use in policies)
-- ============================================================
create or replace function get_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================
-- RPC: create_sale — atomically records a sale and deducts stock
-- ============================================================
create or replace function create_sale(
  p_customer_name text,
  p_customer_phone text,
  p_discount numeric,
  p_payment_method text,
  p_installments int,
  p_items jsonb  -- [{ "product_id": "...", "quantity": 1, "unit_price": 10.00 }, ...]
) returns uuid as $$
declare
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_total numeric;
  v_invoice text;
  item jsonb;
  v_stock int;
begin
  if get_role() not in ('admin','cashier','inventory_manager') then
    raise exception 'Not authorized to record sales';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select quantity into v_stock from products where id = (item->>'product_id')::uuid;
    if v_stock is null then
      raise exception 'Product not found';
    end if;
    if v_stock < (item->>'quantity')::int then
      raise exception 'Insufficient stock for one of the selected products';
    end if;
    v_subtotal := v_subtotal + (item->>'quantity')::int * (item->>'unit_price')::numeric;
  end loop;

  v_total := greatest(0, v_subtotal - coalesce(p_discount, 0));
  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into sales (invoice_no, customer_name, customer_phone, subtotal, discount, total, payment_method, installments, created_by)
  values (v_invoice, p_customer_name, p_customer_phone, v_subtotal, coalesce(p_discount,0), v_total, p_payment_method, p_installments, auth.uid())
  returning id into v_sale_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (
      v_sale_id,
      (item->>'product_id')::uuid,
      (item->>'quantity')::int,
      (item->>'unit_price')::numeric,
      (item->>'quantity')::int * (item->>'unit_price')::numeric
    );

    update products
    set quantity = quantity - (item->>'quantity')::int, updated_at = now()
    where id = (item->>'product_id')::uuid;
  end loop;

  return v_sale_id;
end;
$$ language plpgsql security definer;

grant execute on function create_sale to authenticated;

-- ============================================================
-- RPC: receive_purchase_order — adds stock in and updates cost price
-- ============================================================
create or replace function receive_purchase_order(p_po_id uuid)
returns void as $$
declare
  item record;
begin
  if get_role() not in ('admin','inventory_manager') then
    raise exception 'Not authorized to receive stock';
  end if;

  for item in select * from purchase_order_items where purchase_order_id = p_po_id loop
    update products
    set quantity = quantity + item.quantity, cost_price = item.unit_cost, updated_at = now()
    where id = item.product_id;
  end loop;

  update purchase_orders set status = 'received', received_at = now() where id = p_po_id;
end;
$$ language plpgsql security definer;

grant execute on function receive_purchase_order to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;

-- profiles: everyone can see their own row; admins can see & edit everyone's
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (auth.uid() = id or get_role() = 'admin');

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (get_role() = 'admin');

-- suppliers: any signed-in approved staff can read; admin/inventory manage
drop policy if exists "suppliers_select" on suppliers;
create policy "suppliers_select" on suppliers for select
  using (get_role() is not null and get_role() <> 'pending');

drop policy if exists "suppliers_write" on suppliers;
create policy "suppliers_write" on suppliers for all
  using (get_role() in ('admin','inventory_manager'))
  with check (get_role() in ('admin','inventory_manager'));

-- products: any approved staff can read; admin/inventory manage
drop policy if exists "products_select" on products;
create policy "products_select" on products for select
  using (get_role() is not null and get_role() <> 'pending');

drop policy if exists "products_write" on products;
create policy "products_write" on products for all
  using (get_role() in ('admin','inventory_manager'))
  with check (get_role() in ('admin','inventory_manager'));

-- purchase orders & items: admin/inventory read & write
drop policy if exists "po_select" on purchase_orders;
create policy "po_select" on purchase_orders for select
  using (get_role() in ('admin','inventory_manager'));

drop policy if exists "po_write" on purchase_orders;
create policy "po_write" on purchase_orders for all
  using (get_role() in ('admin','inventory_manager'))
  with check (get_role() in ('admin','inventory_manager'));

drop policy if exists "po_items_select" on purchase_order_items;
create policy "po_items_select" on purchase_order_items for select
  using (get_role() in ('admin','inventory_manager'));

drop policy if exists "po_items_write" on purchase_order_items;
create policy "po_items_write" on purchase_order_items for all
  using (get_role() in ('admin','inventory_manager'))
  with check (get_role() in ('admin','inventory_manager'));

-- sales & sale items: any approved staff can read and insert; only admin edits/deletes
drop policy if exists "sales_select" on sales;
create policy "sales_select" on sales for select
  using (get_role() is not null and get_role() <> 'pending');

drop policy if exists "sales_insert" on sales;
create policy "sales_insert" on sales for insert
  with check (get_role() in ('admin','cashier','inventory_manager'));

drop policy if exists "sales_admin_write" on sales;
create policy "sales_admin_write" on sales for update
  using (get_role() = 'admin');

drop policy if exists "sales_admin_delete" on sales;
create policy "sales_admin_delete" on sales for delete
  using (get_role() = 'admin');

drop policy if exists "sale_items_select" on sale_items;
create policy "sale_items_select" on sale_items for select
  using (get_role() is not null and get_role() <> 'pending');

drop policy if exists "sale_items_insert" on sale_items;
create policy "sale_items_insert" on sale_items for insert
  with check (get_role() in ('admin','cashier','inventory_manager'));

-- ============================================================
-- Done. Next step: sign up your first user from the website,
-- then in the SQL editor run:
--   update profiles set role = 'admin' where id = 'PASTE-THE-USER-UUID-HERE';
-- Find the UUID under Authentication > Users in the Supabase dashboard.
-- ============================================================

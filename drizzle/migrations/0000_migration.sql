
CREATE TYPE public.app_role AS ENUM ('owner','manager','kitchen','delivery','admin');
CREATE TYPE public.order_status AS ENUM ('NEW','ACCEPTED','PREPARING','READY','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUNDED','FAILED');
CREATE TYPE public.payment_status AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
CREATE TYPE public.source_status AS ENUM ('not_connected','connected','paused','error','syncing');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email) VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
$$;

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  owner_name text,
  phone text,
  email text,
  address text,
  gstin text,
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  bank_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  stations text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid,
  invited_email text,
  display_name text,
  role public.app_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id)
);

CREATE OR REPLACE FUNCTION public.member_role(_rid uuid) RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.restaurant_members WHERE restaurant_id = _rid AND user_id = auth.uid() AND active LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_member(_rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.member_role(_rid) IS NOT NULL OR public.is_platform_admin()
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_rid uuid, _roles public.app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.member_role(_rid) = ANY(_roles), false) OR public.is_platform_admin()
$$;

GRANT SELECT, UPDATE ON public.restaurants TO authenticated;
GRANT ALL ON public.restaurants TO service_role;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read restaurant" ON public.restaurants FOR SELECT TO authenticated USING (public.is_member(id));
CREATE POLICY "owner updates restaurant" ON public.restaurants FOR UPDATE TO authenticated USING (public.has_any_role(id, ARRAY['owner']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_members TO authenticated;
GRANT ALL ON public.restaurant_members TO service_role;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read members" ON public.restaurant_members FOR SELECT TO authenticated USING (public.is_member(restaurant_id));
CREATE POLICY "owner manages members ins" ON public.restaurant_members FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner']::public.app_role[]));
CREATE POLICY "owner manages members upd" ON public.restaurant_members FOR UPDATE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner']::public.app_role[]));
CREATE POLICY "owner manages members del" ON public.restaurant_members FOR DELETE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner']::public.app_role[]) AND user_id IS DISTINCT FROM auth.uid());

CREATE TABLE public.order_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  display_name text NOT NULL,
  environment text NOT NULL DEFAULT 'mock' CHECK (environment IN ('mock','production')),
  status public.source_status NOT NULL DEFAULT 'not_connected',
  health text NOT NULL DEFAULT 'unknown',
  connected_account text,
  last_sync_at timestamptz,
  last_error text,
  orders_received integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, connector_key, display_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_sources TO authenticated;
GRANT ALL ON public.order_sources TO service_role;
ALTER TABLE public.order_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgr read sources" ON public.order_sources FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));
CREATE POLICY "mgr ins sources" ON public.order_sources FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));
CREATE POLICY "mgr upd sources" ON public.order_sources FOR UPDATE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));
CREATE POLICY "owner del sources" ON public.order_sources FOR DELETE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner']::public.app_role[]));

CREATE TABLE public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL UNIQUE REFERENCES public.order_sources(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgr customers" ON public.customers FOR ALL TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[])) WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.delivery_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  phone text,
  station text,
  available boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partners TO authenticated;
GRANT ALL ON public.delivery_partners TO service_role;
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read partners" ON public.delivery_partners FOR SELECT TO authenticated USING (public.is_member(restaurant_id));
CREATE POLICY "mgr write partners" ON public.delivery_partners FOR ALL TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[])) WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE SEQUENCE public.order_number_seq START 10001;
GRANT USAGE ON SEQUENCE public.order_number_seq TO authenticated, service_role;
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('RF-' || nextval('public.order_number_seq')::text),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.order_sources(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  external_order_id text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  train_number text,
  train_name text,
  journey_date date,
  delivery_station text,
  coach text,
  seat text,
  instructions text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'COD',
  payment_status public.payment_status NOT NULL DEFAULT 'PENDING',
  status public.order_status NOT NULL DEFAULT 'NEW',
  delivery_status text NOT NULL DEFAULT 'UNASSIGNED',
  priority text NOT NULL DEFAULT 'normal',
  deliver_by timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, source_key, external_order_id)
);
CREATE INDEX orders_rest_created ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX orders_rest_status ON public.orders(restaurant_id, status);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read orders" ON public.orders FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager','kitchen']::public.app_role[]));
CREATE POLICY "mgr insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));
CREATE POLICY "staff update orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager','kitchen','delivery']::public.app_role[]));

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  notes text
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read items" ON public.order_items FOR SELECT TO authenticated USING (public.is_member(restaurant_id));
CREATE POLICY "mgr insert items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read history" ON public.order_status_history FOR SELECT TO authenticated USING (public.is_member(restaurant_id));
CREATE POLICY "insert history" ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (public.is_member(restaurant_id));

CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.delivery_partners(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ASSIGNED',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  delivered_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read deliveries" ON public.deliveries FOR SELECT TO authenticated USING (
  public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.delivery_partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "mgr write deliveries" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));
CREATE POLICY "update deliveries" ON public.deliveries FOR UPDATE TO authenticated USING (
  public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.delivery_partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));

CREATE POLICY "delivery reads assigned orders" ON public.orders FOR SELECT TO authenticated USING (
  public.member_role(restaurant_id) = 'delivery' AND EXISTS (
    SELECT 1 FROM public.deliveries d JOIN public.delivery_partners p ON p.id = d.partner_id
    WHERE d.order_id = orders.id AND p.user_id = auth.uid()));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  method text NOT NULL,
  mode text NOT NULL DEFAULT 'online' CHECK (mode IN ('online','offline')),
  amount numeric(12,2) NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'PENDING',
  provider_ref text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read payments" ON public.payments FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'PROCESSED',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read refunds" ON public.refunds FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross numeric(12,2) NOT NULL DEFAULT 0,
  discounts numeric(12,2) NOT NULL DEFAULT 0,
  commission numeric(12,2) NOT NULL DEFAULT 0,
  refunds numeric(12,2) NOT NULL DEFAULT 0,
  adjustments numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settlements TO authenticated;
GRANT ALL ON public.settlements TO service_role;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read settlements" ON public.settlements FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read notif" ON public.notifications FOR SELECT TO authenticated USING (public.is_member(restaurant_id));
CREATE POLICY "ins notif" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_member(restaurant_id));
CREATE POLICY "upd notif" ON public.notifications FOR UPDATE TO authenticated USING (public.is_member(restaurant_id));

CREATE TABLE public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.order_sources(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'order_ingest',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','duplicate')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ingestion_jobs TO authenticated;
GRANT ALL ON public.ingestion_jobs TO service_role;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgr jobs" ON public.ingestion_jobs FOR ALL TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[])) WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner']::public.app_role[]) OR public.is_platform_admin());
CREATE POLICY "insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND (restaurant_id IS NULL OR public.is_member(restaurant_id)));

CREATE OR REPLACE FUNCTION public.create_restaurant(_name text, _owner_name text, _phone text, _email text, _address text, _gstin text, _hours jsonb, _bank jsonb, _stations text[], _logo_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(coalesce(_name,'')) < 2 THEN RAISE EXCEPTION 'name required'; END IF;
  INSERT INTO public.restaurants(name, owner_name, phone, email, address, gstin, operating_hours, bank_details, stations, logo_url, created_by)
  VALUES (_name, _owner_name, _phone, _email, _address, _gstin, coalesce(_hours,'{}'), coalesce(_bank,'{}'), coalesce(_stations,'{}'), _logo_url, auth.uid())
  RETURNING id INTO rid;
  INSERT INTO public.restaurant_members(restaurant_id, user_id, role, display_name) VALUES (rid, auth.uid(), 'owner', _owner_name);
  INSERT INTO public.order_sources(restaurant_id, connector_key, display_name, environment, status, health) VALUES
    (rid,'manual','Direct / Manual Orders','production','connected','healthy');
  INSERT INTO public.audit_logs(restaurant_id, actor_id, action, entity, entity_id) VALUES (rid, auth.uid(), 'restaurant.created','restaurant', rid::text);
  RETURN rid;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_restaurant FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_restaurant TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_sources;

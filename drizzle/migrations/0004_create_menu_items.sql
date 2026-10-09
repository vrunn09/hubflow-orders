CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  available boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE INDEX menu_items_restaurant_idx ON public.menu_items (restaurant_id, category, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read menu items" ON public.menu_items
  FOR SELECT TO authenticated USING (public.is_member(restaurant_id));

CREATE POLICY "managers can insert menu items" ON public.menu_items
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "managers can update menu items" ON public.menu_items
  FOR UPDATE TO authenticated
  USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "managers can delete menu items" ON public.menu_items
  FOR DELETE TO authenticated USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::app_role[]));
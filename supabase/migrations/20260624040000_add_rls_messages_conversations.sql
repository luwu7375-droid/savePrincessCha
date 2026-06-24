-- Fix: messages and conversations had RLS enabled but no policies → all queries denied
-- Single-user app: allow any authenticated user full access

CREATE POLICY "auth users can read messages"
  ON public.messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth users can update messages"
  ON public.messages FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can delete messages"
  ON public.messages FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can read conversations"
  ON public.conversations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth users can update conversations"
  ON public.conversations FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can delete conversations"
  ON public.conversations FOR DELETE
  USING (auth.role() = 'authenticated');

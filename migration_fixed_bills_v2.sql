-- Migration: adiciona dia_vencimento e tipo na tabela fixed_bills
-- Execute no SQL Editor do Supabase (Database > SQL Editor)

ALTER TABLE public.fixed_bills
  ADD COLUMN IF NOT EXISTS dia_vencimento integer;

ALTER TABLE public.fixed_bills
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'PF';

ALTER TABLE public.fixed_bills
  DROP CONSTRAINT IF EXISTS fixed_bills_tipo_check;

ALTER TABLE public.fixed_bills
  ADD CONSTRAINT fixed_bills_tipo_check CHECK (tipo IN ('PF', 'PJ'));

-- Migration: adiciona coluna "modo" na tabela profiles
-- Rode este SQL no Editor SQL do Supabase (Database > SQL Editor)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'completo';

-- Garante que só valores válidos são aceitos
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_modo_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_modo_check CHECK (modo IN ('pessoal', 'completo'));

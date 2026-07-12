-- Migration: habilita Supabase Realtime na tabela items
-- Rode este SQL no Editor SQL do Supabase (Database > SQL Editor)
-- Necessário para que INSERT/UPDATE/DELETE em items sejam propagados
-- em tempo real para outros dispositivos logados no mesmo usuário.

alter publication supabase_realtime add table items;

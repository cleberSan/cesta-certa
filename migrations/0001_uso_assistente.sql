-- Contadores de uso do assistente (spec 0001, CA-30; ADR-0004): uma linha por dia de
-- Brasília ("2026-11-13"), e o mês é a soma das linhas dele. Sem conteúdo, sem IP e sem
-- identificação. O Worker repete esta instrução em cada reserva (worker/assistente/cota.ts),
-- então aplicar a migração é opcional.
CREATE TABLE IF NOT EXISTS uso_assistente (periodo TEXT PRIMARY KEY NOT NULL, usadas INTEGER NOT NULL DEFAULT 0 CHECK (usadas >= 0));

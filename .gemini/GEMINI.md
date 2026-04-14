---
trigger: always_on
---

# Regras Locais do Projeto recebimento-smart

## Supabase Migrations
- **SEMPRE** rodar os scripts de migração SQL via **MCP do Supabase** (`apply_migration` ou `execute_sql`), nunca pedir para o usuário rodar manualmente.
- O `project_id` do Supabase para este projeto é: `kwdweztilsoxxcgudtsz`.
- Criar novos arquivos de migração com timestamp sequencial (formato: `YYYYMMDDHHMMSS_nome.sql`).
- Nunca modificar arquivos de migração existentes; sempre criar um novo com número maior.

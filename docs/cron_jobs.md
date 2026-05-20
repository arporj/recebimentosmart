# Cron Jobs — Recebimento Smart

> Documentação dos jobs agendados via `pg_cron` no Supabase.
>
> **Projeto:** `kwdweztilsoxxcgudtsz` (recebimentosmart)
>
> **Última atualização:** 20/05/2026

---

## Visão Geral

| # | Job ID | Nome | Agendamento | Horário (BRT) | Status |
|---|--------|------|-------------|---------------|--------|
| 1 | 12 | Renovação Diária de Assinaturas | `0 3 * * *` | Meia-noite (00h BRT) | ✅ Ativo |
| 2 | 8 | process-email-broadcast-queue-job | `*/5 * * * *` | A cada 5 minutos | ⚠️ Ativo (candidato a sob demanda) |
| 3 | 13 | weekly-due-notification-sunday | `0 3 * * 0` | Domingos à meia-noite (00h BRT) | ✅ Ativo |
| 4 | 11 | auto-confirm-daily | `0 3 * * *` | Meia-noite (00h BRT) | ✅ Ativo |

> **Nota:** O Supabase usa UTC internamente. Os horários BRT (UTC-3) são aproximados e podem variar com horário de verão.

---

## Detalhamento dos Jobs

### 1. Renovação Diária de Assinaturas

| Campo | Valor |
|-------|-------|
| **Job ID** | 12 |
| **Nome** | Renovação Diária de Assinaturas |
| **Cron** | `0 3 * * *` (todo dia às 03:00 UTC / 00:00 BRT) |
| **Função** | `public.process_subscription_renewals()` |

**O que faz:**

Verifica diariamente se há usuários cuja assinatura expirou (campo `valid_until` na tabela `profiles`). Para cada um desses usuários, confere se ele possui **5 ou mais indicações convertidas** (`referrals` com `is_converted = true`) que ainda não foram utilizadas para renovação (`is_used_for_renewal = false`).

Se a condição for atendida:
- Estende a assinatura do usuário em **+1 mês** (`valid_until + INTERVAL '1 month'`).
- Marca **5 indicações** como utilizadas (`is_used_for_renewal = true`), consumindo-as.

**Tabelas envolvidas:**
- `public.profiles` — leitura/escrita do campo `valid_until`
- `public.referrals` — leitura de indicações convertidas, escrita para marcar como usadas

**Regra de negócio:** A cada 5 indicações convertidas, o usuário ganha 1 mês gratuito de assinatura, automaticamente.

---

### 2. Processamento da Fila de Broadcasts (E-mails)

| Campo | Valor |
|-------|-------|
| **Job ID** | 8 |
| **Nome** | process-email-broadcast-queue-job |
| **Cron** | `*/5 * * * *` (a cada 5 minutos) |
| **Função** | `public.invoke_process_broadcast_queue_function()` |

**O que faz:**

A cada 5 minutos, invoca a Edge Function `process-broadcast-queue` via HTTP POST. Essa função processa a fila de e-mails/broadcasts pendentes no sistema.

**Fluxo completo:**
1. A função SQL `invoke_process_broadcast_queue_function()` monta uma requisição HTTP POST usando `net.http_post()`.
2. Aguarda **15 segundos** (`pg_sleep(15)`) para a Edge Function processar.
3. Consulta a tabela `net._http_response` para verificar se a chamada foi bem-sucedida (status 2xx).
4. A Edge Function busca o broadcast pendente mais antigo na tabela `email_broadcasts`.
5. Se não houver nenhum pendente, encerra imediatamente com "Nenhum broadcast pendente."
6. Se houver, busca todos os usuários ativos (assinatura válida ou expirada há no máx 60 dias + admins).
7. Envia e-mails personalizados em lotes de 50 via **Brevo** (API SMTP).
8. Marca o broadcast como `completed`.

**Edge Function chamada:**
- URL: `https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/process-broadcast-queue`
- Autenticação: `service_role_key` (Bearer token)

**Tabelas envolvidas:**
- `public.email_broadcasts` — fila de broadcasts (subject, body, status)
- `public.profiles` — dados dos usuários destinatários

**Tratamento de erros:** Captura `WHEN OTHERS` e loga o erro via `RAISE WARNING`. A Edge Function envia um e-mail de alerta para `andre@recebimentosmart.com.br` em caso de falha.

> ⚠️ **Nota:** Este job é candidato a ser convertido para execução **sob demanda** (trigger no INSERT da tabela `email_broadcasts`) em vez de polling a cada 5 minutos. Usado apenas 2 vezes desde julho/2025.

---

### 3. Notificação Semanal de Vencimentos

| Campo | Valor |
|-------|-------|
| **Job ID** | 13 |
| **Nome** | weekly-due-notification-sunday |
| **Cron** | `0 3 * * 0` (domingos às 03:00 UTC / 00:00 BRT) |
| **Função** | `public.invoke_weekly_notifications_function()` |

**O que faz:**

Todo domingo à meia-noite (horário de Brasília), executa a função `invoke_weekly_notifications_function()`, que faz uma chamada HTTP POST para a Edge Function `cron-weekly-notifications`. Essa Edge Function envia notificações aos usuários sobre contas que estão prestes a vencer na semana seguinte.

**Fluxo interno:**
1. Monta uma requisição HTTP POST para a Edge Function usando `net.http_post()`.
2. Autentica com `service_role_key` (Bearer token) diretamente na função.
3. Aguarda **15 segundos** (`pg_sleep(15)`) para a Edge Function processar.
4. Consulta `net._http_response` para verificar se a chamada foi bem-sucedida (status 2xx).
5. Loga warnings em caso de falha ou timeout.

**Edge Function chamada:**
- URL: `https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/cron-weekly-notifications`
- Autenticação: `service_role_key` (Bearer token)

**Observação:** Corrigido em 20/05/2026 — o job original (ID 9) falhava porque usava `current_setting('request.header.apikey')` que retorna NULL em contexto de cron. Substituído por função wrapper com `service_role_key` direto.

---

### 4. Confirmação Automática de Lançamentos

| Campo | Valor |
|-------|-------|
| **Job ID** | 11 |
| **Nome** | auto-confirm-daily |
| **Cron** | `0 3 * * *` (todo dia às 03:00 UTC / ~00:00 BRT) |
| **Função** | `public.fn_auto_confirm_transactions()` |

**O que faz:**

Diariamente, busca todos os lançamentos financeiros que atendem às três condições:
- `auto_confirm = true` — o usuário marcou "Confirmar automaticamente" ao criar o lançamento
- `status = 'pending'` — o lançamento ainda não foi confirmado
- `date <= CURRENT_DATE` — a data de vencimento já chegou ou passou

Para todos os lançamentos encontrados, executa:
- `status = 'paid'` — marca como pago/recebido
- `updated_at = now()` — registra o momento da confirmação

**Tabelas envolvidas:**
- `public.financial_transactions` — leitura/escrita

**Log:** Se algum lançamento for confirmado, gera um log no formato:
```
[auto_confirm] X lançamento(s) confirmado(s) automaticamente em YYYY-MM-DD
```

**Migração de origem:** `20260520191900_auto_confirm_cron_job.sql`

---

## Como Gerenciar os Jobs

### Listar todos os jobs
```sql
SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;
```

### Desativar um job temporariamente
```sql
UPDATE cron.job SET active = false WHERE jobid = <ID>;
```

### Reativar um job
```sql
UPDATE cron.job SET active = true WHERE jobid = <ID>;
```

### Remover um job
```sql
SELECT cron.unschedule(<ID>);
```

### Ver histórico de execuções
```sql
SELECT * FROM cron.job_run_details WHERE jobid = <ID> ORDER BY start_time DESC LIMIT 10;
```

---

## Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 20/05/2026 | Criado job 11 (auto-confirm-daily) |
| 20/05/2026 | Job 1 → Job 12: horário corrigido de 00:00 UTC para 03:00 UTC (00:00 BRT) |
| 20/05/2026 | Job 9 → Job 13: corrigido erro de autenticação (JSON inválido) e horário para 03:00 UTC |

# Planejamento: módulo financeiro — contas únicas, parceladas e recorrentes

## Contexto do projeto

Sistema: RecebimentoSmart (React + TypeScript + Vite + Supabase)
Objetivo: expandir o sistema de recebimentos recorrentes de clientes para um controle financeiro completo, suportando contas a pagar e receitas avulsas nas modalidades: única, parcelada e recorrente.

O banco já possui a tabela `financial_transactions` com estrutura parcial. A migração deve ser aditiva — sem quebrar nada que já existe.

---

## Comportamento esperado (referência: app Meu Dinheiro Web)

### Conta única
- Um único lançamento em uma data específica.
- Sem filhas, sem agrupamento.

### Conta parcelada
- Uma transação "mãe" define o total e o número de parcelas.
- O sistema gera automaticamente N transações filhas, uma por mês, cada uma com sua data de vencimento e valor. O usuário pode escolher definir o valor por parcela ou o valor total, que será dividido pela quantidade de parcelas (total / N).
- O usuário marca cada parcela individualmente como paga.

### Conta recorrente
- Uma transação "mãe" define a regra (valor, periodicidade, dia do mês).
- O sistema gera automaticamente 12 ocorrências filhas à frente.
- Novas ocorrências são geradas automaticamente quando o horizonte estiver acabando (ver seção "Geração automática").
- O usuário vê a ocorrência em qualquer mês que abrir, já existente no banco.

### Edição de recorrente/parcelada
Ao editar uma ocorrência que tem `parent_id`, o sistema pergunta:
1. **"Só este mês"** → atualiza apenas o registro atual + marca `is_customized = true`. O `parent_id` é mantido.
2. **"Este e todos os seguintes"** → atualiza o registro atual e todos com mesmo `parent_id` e `date >= date_atual`, **exceto** os que têm `is_customized = true`.
3. **"Todos"** → atualiza todos com o mesmo `parent_id`, que já não tenha tido uma ação do usuário (ao efetivar o pagamento de um lançamento, perde-se o `parent_id`)

### Exclusão de recorrente/parcelada
Ao excluir uma ocorrência que tem `parent_id`, o sistema pergunta:
1. **"Só este mês"** → deleta apenas o registro atual. Os outros continuam.
2. **"Este e todos os seguintes"** → deleta onde `parent_id = X AND date >= date_atual`.
3. **"Todos"** → deleta todos com `parent_id = X` (incluindo a mãe), que já não tenha tido uma ação do usuário (ao efetivar o pagamento de um lançamento, perde-se o `parent_id`).

---

## Migration do banco de dados

Rodar no SQL Editor do Supabase. É segura — só adiciona colunas e índices, não altera nada existente.

```sql
-- Modalidade explícita da transação
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS modalidade text
    CHECK (modalidade IN ('unica', 'parcelada', 'recorrente'))
    DEFAULT 'unica';

-- Auto-referência sem cascade: filhas sobrevivem se a mãe for apagada
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES financial_transactions(id) ON DELETE SET NULL;

-- Controle de parcelas
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS installment_number integer;

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS total_installments integer;

-- Dia fixo de vencimento para recorrentes
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS due_day integer
    CHECK (due_day BETWEEN 1 AND 31);

-- Data de fim da recorrência (null = sem fim)
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;

-- Marca ocorrências editadas individualmente
-- Impede que "editar todos os seguintes" sobrescreva customizações pontuais
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS is_customized boolean DEFAULT false;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ft_parent_id
  ON financial_transactions(parent_id);

CREATE INDEX IF NOT EXISTS idx_ft_user_status_date
  ON financial_transactions(user_id, status, date);

CREATE INDEX IF NOT EXISTS idx_ft_modalidade
  ON financial_transactions(user_id, modalidade);
```

---

## Geração automática de ocorrências futuras

### Estratégia: dupla (pg_cron + fallback no frontend)

**Backend — pg_cron (roda todo dia 1º do mês):**

```sql
-- Habilitar extensão (rodar uma vez)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job mensal
SELECT cron.schedule(
  'gerar-recorrencias-mensais',
  '0 6 1 * *', -- todo dia 1 às 06h
  $$
  INSERT INTO financial_transactions (
    user_id, type, description, amount, date, modalidade,
    parent_id, installment_number, recurrence_enabled,
    recurrence_period, due_day, account_id, category_id,
    status, is_customized
  )
  SELECT
    mae.user_id,
    mae.type,
    mae.description,
    mae.amount,
    (date_trunc('month', now()) + interval '2 month' - interval '1 day' +
      make_interval(days := mae.due_day - 1))::date,
    'recorrente',
    mae.id,
    (SELECT COALESCE(MAX(installment_number), 0) + 1
     FROM financial_transactions
     WHERE parent_id = mae.id),
    true,
    mae.recurrence_period,
    mae.due_day,
    mae.account_id,
    mae.category_id,
    'pending',
    false
  FROM financial_transactions mae
  WHERE mae.modalidade = 'recorrente'
    AND mae.parent_id IS NULL
    AND (mae.recurrence_end_date IS NULL OR mae.recurrence_end_date > now())
    AND NOT EXISTS (
      SELECT 1 FROM financial_transactions filha
      WHERE filha.parent_id = mae.id
        AND filha.date >= date_trunc('month', now()) + interval '2 month'
        AND filha.date < date_trunc('month', now()) + interval '3 month'
    );
  $$
);
```

**Frontend — fallback ao navegar para um mês:**

Ao abrir qualquer tela com visão periódica, verificar se existem recorrentes ativas sem ocorrência no período visualizado. Se não existir, chamar a função `gerarOcorrenciaDoMes(parentId, mesAno)` antes de renderizar.

---

## Funções TypeScript a implementar

### 1. `criarTransacao(dados)`

Detecta a modalidade e age:
- `unica` → insere 1 registro diretamente
- `parcelada` → insere a mãe + N filhas em batch
- `recorrente` → insere a mãe + 12 filhas em batch

```typescript
// Assinatura esperada
async function criarTransacao(
  supabase: SupabaseClient,
  dados: {
    user_id: string
    type: 'income' | 'expense'
    description: string
    amount: number
    date: string           // ISO date: '2025-04-17'
    modalidade: 'unica' | 'parcelada' | 'recorrente'
    account_id?: string
    category_id?: string
    // Parcelada
    total_installments?: number
    // Recorrente
    recurrence_period?: 'weekly' | 'monthly' | 'yearly'
    due_day?: number
    recurrence_end_date?: string
  }
): Promise<void>
```

### 2. `editarTransacao(opcao, transacao, novosDados)`

```typescript
type OpcaoEdicao = 'este' | 'este_e_seguintes' | 'todos'

async function editarTransacao(
  supabase: SupabaseClient,
  opcao: OpcaoEdicao,
  transacao: { id: string; parent_id: string | null; date: string },
  novosDados: Partial<{ amount: number; description: string; due_day: number; status: string }>
): Promise<void>

// Regras:
// 'este'              → update where id = transacao.id + is_customized = true
// 'este_e_seguintes'  → update where parent_id = X AND date >= data AND is_customized = false
// 'todos'             → update where parent_id = X (sem filtro de is_customized)
```

### 3. `deletarTransacao(opcao, transacao)`

```typescript
async function deletarTransacao(
  supabase: SupabaseClient,
  opcao: OpcaoEdicao,
  transacao: { id: string; parent_id: string | null; date: string }
): Promise<void>

// Regras:
// 'este'              → delete where id = transacao.id
// 'este_e_seguintes'  → delete where parent_id = X AND date >= data
// 'todos'             → delete where parent_id = X, depois delete where id = parent_id
```

### 4. `gerarOcorrenciaDoMes(parentId, ano, mes)` (fallback frontend)

```typescript
async function gerarOcorrenciaDoMes(
  supabase: SupabaseClient,
  parentId: string,
  ano: number,
  mes: number // 0-indexed
): Promise<void>
// Verifica se já existe ocorrência no mês. Se não, gera uma.
```

---

## Componente de modal de confirmação

Sempre que uma transação com `parent_id` for editada ou apagada, exibir modal com as 3 opções. Exemplo de interface:

```tsx
// Props esperadas
interface ModalConfirmacaoRecorrenteProps {
  acao: 'editar' | 'apagar'
  onConfirm: (opcao: 'este' | 'este_e_seguintes' | 'todos') => void
  onCancel: () => void
}
```

---

## Formulário de criação

O formulário de nova transação deve ter os campos:

**Sempre visíveis:**
- Tipo (receita / despesa)
- Descrição
- Valor
- Data de vencimento
- Conta bancária (account_id)
- Categoria (category_id)
- Modalidade: `[ Única ] [ Parcelada ] [ Recorrente ]`

**Se parcelada:**
- Número de parcelas (input numérico)
- Valor total (calculado automaticamente: valor / parcelas, editável) ou por parcela 

**Se recorrente:**
- Periodicidade (diário / semanal / mensal / anual)
- Se semanal, escolha o dia da semana para o vencimento. Se mensal ou anual, escolher a data do vencimento (se mensal, o mesmo dia todo mês, se anual, mesmo dia/mês todo ano)
- Data de encerramento (opcional)

---

## Arquivos a criar/modificar (estimativa)

| Arquivo | Ação |
|---|---|
| `supabase/migrations/XXXXXX_financial_parcelas.sql` | Criar — migration acima |
| `src/lib/financeiro/criarTransacao.ts` | Criar |
| `src/lib/financeiro/editarTransacao.ts` | Criar |
| `src/lib/financeiro/deletarTransacao.ts` | Criar |
| `src/lib/financeiro/gerarOcorrencias.ts` | Criar |
| `src/components/financeiro/ModalOpcaoRecorrente.tsx` | Criar |
| `src/components/financeiro/FormTransacao.tsx` | Criar ou adaptar existente |
| `src/pages/ContasPagar.tsx` | Criar ou adaptar |
| `src/pages/ReceitasAvulsas.tsx` | Criar ou adaptar |

---

## Regras importantes para a IA implementadora

1. **Não alterar** as colunas existentes em `financial_transactions` — apenas adicionar.
2. **Não usar** `ON DELETE CASCADE` no `parent_id` — usar `ON DELETE SET NULL`.
3. Ao editar "este e seguintes", **nunca sobrescrever** registros com `is_customized = true`.
4. O `parent_id` de uma ocorrência **nunca deve ser removido** ao editá-la individualmente — apenas setar `is_customized = true`.
5. A transação mãe (`parent_id IS NULL`) deve ser sempre do tipo recorrente ou parcelada — nunca aparece diretamente nas listagens mensais. Filtrar por `parent_id IS NOT NULL OR modalidade = 'unica'` nas queries de listagem.
6. Usar `batch insert` (array) ao criar parcelas — não fazer N inserts individuais.
7. Toda query deve filtrar por `user_id` — RLS está ativo.

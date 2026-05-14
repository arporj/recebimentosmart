# 💰 Arquitetura e Regras: Sistema Financeiro V2

Este documento formaliza a modelagem de dados, gatilhos de banco e fluxo operacional do módulo de **Gestão Financeira** implementado na versão 2.0.

---

## 🗄️ 1. Modelagem Relacional (Tabelas Supabase)

O ecossistema financeiro fundamenta-se em quatro entidades core conectadas ao `user_id`:

### `financial_accounts` (Contas Financeiras)
* **Finalidade:** Rastrear saldos de bancos, carteiras físicas ou gateways de recebimento.
* **Campos Principais:** `id`, `name`, `type` (bank, cash, digital_wallet, credit_card), `balance`, `user_id`.

### `financial_categories` (Categorias de Transação)
* **Finalidade:** Categorizar entradas e saídas (ex: Alimentação, Aluguel, Recebimento de Cliente).
* **Campos Principais:** `id`, `name`, `type` (income, expense), `color`, `icon`, `user_id`.

### `financial_transactions` (Livro de Transações)
* **Finalidade:** Registro cronológico definitivo de eventos financeiros.
* **Campos Principais:**
  * `amount` (numeric 12,2)
  * `type` ('income', 'expense', 'transfer')
  * `status` ('pending', 'paid', 'cancelled')
  * `due_date` (date - Vencimento operacional)
  * `payment_date` (date - Liquidação efetiva)
  * `account_id` e `destination_account_id` (para transferências)
  * `category_id` e `client_id` (opcionais, para conciliação)
  * `recurrence_id` e `parcel_group_id` (vínculos de repetição)

### `financial_recurrence_settings` (Configurações de Recorrência)
* **Finalidade:** Configuração central para gerar cobranças repetitivas automaticamente.
* **Campos Principais:** `frequency` ('daily', 'weekly', 'monthly', 'yearly'), `interval`, `end_date`, `auto_generate`.

---

## 🔄 2. Fluxo de Automação de Recorrência (Supabase Triggers)

Para otimizar o desempenho em tempo real no cliente, as transações recorrentes são gerenciadas via gatilhos e funções no banco de dados PostgreSQL:

1. **Criação da Regra:**
   * Ao salvar uma transação configurada como "Recorrente", uma linha é criada na tabela `financial_recurrence_settings`.
   * A transação base registra o `recurrence_id`.
2. **Instanciamento Antecipado:**
   * Uma Trigger observa a tabela `financial_transactions`.
   * Ao inserir ou marcar uma transação recorrente como liquidada, o banco calcula automaticamente os próximos períodos.
   * Projeta-se o próximo registro com status `pending` e `due_date` incrementada baseando-se na frequência (`frequency` e `interval`).
3. **Transações Parceladas:**
   * Tratadas separadamente através do agrupador `parcel_group_id`.
   * Ao salvar, gera-se imediatamente todas as *N* parcelas futuras (ex: 12 transações individuais), diferenciando-se apenas por seus índices e vencimentos lineares.

---

## 🔀 3. Fluxo de Transferência entre Contas

Uma transação com `type = 'transfer'` gera um impacto reverso imediato nas contas envolvidas:

* **Conta Origem (`account_id`):** O valor é deduzido (`balance = balance - amount`).
* **Conta Destino (`destination_account_id`):** O valor é creditado (`balance = balance + amount`).
* **Integridade Referencial:** A interface garante que `account_id` seja diferente de `destination_account_id` para evitar redundâncias inúteis de processamento.

---

## ⚠️ 4. Ponto de Atenção: Sincronismo com a Tabela `clients`

**Situação Atual:**
O módulo legado de Clientes ainda manipula e exibe dados baseando-se exclusivamente na tabela histórica `payments`.

**Meta Futura de Integração:**
Toda ação no botão "Pagar" do grid de clientes ou no modal do cliente deve espelhar-se integralmente como uma nova entrada (`income`) vinculada ao `client_id` dentro de `financial_transactions`. A leitura do histórico de recebimentos nas telas de visualização do cliente deve priorizar queries agregadas de `financial_transactions` filtradas por `client_id`.

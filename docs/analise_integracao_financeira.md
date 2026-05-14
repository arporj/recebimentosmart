# Análise de Integração: Clientes vs. Gestão Financeira
**Projeto:** Recebimento $mart  
**Data da Análise:** 14 de Maio de 2026  
**Status:** Incompleto (Transição Pendente)

---

## 📋 Visão Geral do Problema
O sistema encontra-se atualmente em um estado de **transição parcial de dados**. A nova infraestrutura financeira (baseada na tabela `financial_transactions`) foi desenvolvida, mas a área de Clientes legada ainda se baseia na tabela `payments` para gravação e consulta de históricos, gerando silos de dados e inconsistências visuais profundas para o usuário.

---

## 🔍 Mapeamento Técnico das Inconsistências

### ❌ Falha A: Gravação Órfã no Botão "Pagar"
* **Arquivo:** [ClientListV2/index.tsx](../src/components/v2/ClientListV2/index.tsx)
* **Função:** `registerPayment`
* **Comportamento Atual:** Ao registrar um pagamento pela listagem de clientes, a função executa um `insert` direto na tabela legada `payments`.
* **Impacto:** A transação correspondente na tabela `financial_transactions` (módulo financeiro) permanece intocada com status `pending` ou `late`. O usuário paga o cliente, mas a dívida continua constando no Painel Financeiro.

### ❌ Falha B: Calendário de Histórico Defasado
* **Arquivo:** [PaymentHistoryV2/index.tsx](../src/components/v2/PaymentHistoryV2/index.tsx)
* **Comportamento Atual:** O calendário de meses pagos utiliza exclusivamente `supabase.from('payments')` para colorir os cards mensais.
* **Impacto:** Qualquer baixa dada diretamente na "Gestão Financeira" (mudança de status para `paid` na tabela `financial_transactions`) **nunca** se refletirá no histórico da tela do cliente, dando a falsa impressão de inadimplência crônica.

### ❌ Falha C: Valor Forçado em Zero (R$ 0,00)
* **Arquivo:** [ClientFormV2/index.tsx](../src/components/v2/ClientFormV2/index.tsx) e [PaymentModalV2/index.tsx](../src/components/v2/PaymentModalV2/index.tsx)
* **Comportamento Atual:** Para forçar a migração, o cadastro de cliente V2 seta `monthly_payment` como `0` no banco. Porém, o modal de confirmação de pagamento lê `client.monthly_payment` para calcular o valor a ser gerado.
* **Impacto:** Todo registro feito pela tela de Clientes para novas contas gerará pagamentos no valor fixo de **R$ 0,00** na tabela `payments`.

### ❌ Falha D: Ausência de Camada de Sincronização (DB)
* **Status:** Inexistente.
* **Comportamento Atual:** Não há Triggers do PostgreSQL, Edge Functions ou RPCs do Supabase vinculando as tabelas `payments` e `financial_transactions`. São arquiteturas 100% isoladas fisicamente.

---

## 🛠️ Plano de Ação para Integração Definitiva (Roadmap)

Para unificar o sistema e fazer com que "o que fizer em uma reflete na outra", siga os passos abaixo quando iniciar o desenvolvimento:

### Passo 1: Unificar a Leitura (Histórico de Pagamentos)
Modificar o componente `PaymentHistoryV2` para parar de ler `payments` e ler da tabela `financial_transactions` onde `type = 'income'` e `client_id = client.id`.

### Passo 2: Modificar a Ação de Pagamento
Ajustar o `registerPayment` na listagem de clientes. Ao invés de inserir em `payments`, a função deve:
1. Buscar a transação `pending` correspondente ao mês de referência na tabela `financial_transactions`.
2. Fazer o `update` do status dessa transação para `paid`.
3. Se não houver transação criada, criar uma nova transação diretamente em `financial_transactions` já marcada como `paid`.

### Passo 3: Corrigir Coleta de Valor
Atualizar o `PaymentModalV2` para obter o valor sugerido buscando a última transação (ou a transação padrão configurada) do cliente na tabela financeira, ao invés de ler a coluna legada `clients.monthly_payment`.

### Passo 4: Script de Migração Final
Criar uma nova migration SQL no Supabase para copiar dados residuais de `payments` legados para `financial_transactions` (gerando as devidas categorias/contas padrão) e desativar a tabela antiga se desejado.

---

> **Ponto de Atenção:** Qualquer tentativa de corrigir isso pontualmente criando "triggers de sincronização dupla" no banco criará um débito técnico complexo de manter. O caminho ideal é a **substituição total** da dependência da tabela `payments` pelas `financial_transactions`.

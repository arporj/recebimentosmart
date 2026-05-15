# Análise de Integração e Evolução de Recorrência
**Projeto:** Recebimento $mart  
**Data da Análise:** 15 de Maio de 2026  
**Status:** Planejamento Estratégico (Nova UX & Transição Suave)

---

## 📋 Visão Estratégica da Transição (Coexistência Controlada)

Ao invés de uma quebra abrupta na base de dados, adotaremos um modelo de **transição suave e assistida**. Os dados e telas antigas da V1 serão mantidos ativos porém "congelados", oferecendo uma rampa de migração confiável para o usuário final, enquanto o sistema se consolida em torno da arquitetura financeira moderna.

### 🔄 Reconfiguração do Fluxo de Trabalho (UX)
1. **Nova Tela Inicial:** O dashboard/tela de "Lançamentos" financeiros assume o posto de tela principal do sistema.
2. **Congelamento do Legado:** O link atual de Clientes será renomeado para **"Clientes - Antigo"**. Esta tela passa a operar em **modo somente leitura (Read-Only)**, impedindo a criação, edição, exclusão ou lançamento de pagamentos na tabela legada `payments`. Ela serve exclusivamente como repositório de consulta histórica.
3. **Nova Tela "Recorrência":** Um novo módulo centralizado em `financial_transactions` gerenciará a listagem de clientes ativos, suas recorrências e seus saldos consolidados.

---

## 📊 Arquitetura de Recorrência & Consolidação de Saldo (Netting)

Na nova tela de "Recorrência", o foco deixa de ser o simples "mês pago" e passa a ser o **relacionamento financeiro consolidado** com a pessoa ou empresa.

### 💸 Conceito de Saldo Líquido (Netting)
Ao listar um cliente, o sistema calculará em tempo real a resultante de todas as suas obrigações ativas (tanto `income` quanto `expense` vinculadas ao mesmo `client_id`).
*   **Exemplo de Visualização:** Se há **R$ 10,00** a receber de um cliente e **R$ 20,00** a pagar para este mesmo cliente, o saldo final exibido será:
    *   `Saldo Consolidado: -R$ 10,00 (exibido em vermelho)`
*   Clientes com saldo credor aparecem em verde, zerados em cinza e devedores em vermelho.

### 📅 Calendário e Extrato Consolidado do Cliente
Ao clicar para detalhar um cliente ou visualizar seu calendário/resumo, o sistema apresentará um **extrato detalhado e transparente** do período, listando todas as transações filhas e unitárias:
*   `Lançamento 1: Bala de chocolate  | + R$ 10,00` (Bolinha Verde - Pago)
*   `Lançamento 2: Clips de papel      | - R$ 20,00` (Bolinha Vermelha - Atrasado)

---

## 🛠️ Novo Roadmap de Desenvolvimento

Para implantar esta arquitetura de transição, o desenvolvimento seguirá o seguinte sequenciamento:

### Passo 1: Ajustar Rotas e Travar o Legado
- Renomear no menu a rota de clientes para "Clientes - Antigo".
- Aplicar bloqueio lógico nos componentes `ClientListV2`, `ClientFormV2` e `PaymentModalV2` para remover botões de gravação e inputs de edição. 

### Passo 2: Configurar Lançamentos como Home
- Modificar as regras do `react-router-dom` no `App.tsx` para direcionar o login de sucesso diretamente para `/financeiro` ou `/lancamentos`.

### Passo 3: Implementar o Módulo "Recorrência" (V2)
- Criar a nova view que faz o `GROUP BY client_id` das `financial_transactions`.
- Implementar a lógica de agregação (`SUM(income) - SUM(expense)`) e a modal de detalhamento (Extrato do Cliente).

---

## 🛡️ Lógica de Migração de Recorrências (V1 → V2)

O algoritmo de migração de dados não fará mais inserções isoladas por "mês de referência". Em vez disso, ele implantará o ecossistema de recorrências nativo do motor financeiro:

### 1️⃣ Atributos do Lançamento Recorrente Pai
- **Descrição (`description`):** Deve conter rigorosamente apenas o **nome do cliente** (`c.name`). Não haverá concatenação de meses de referência neste campo.
- **Modalidade:** Registrado como `modalidade = 'recorrente'` e `recurrence_enabled = true`.

### 2️⃣ Geração e Expansão Histórica + Futura
- **Data Inicial:** A transação pai da recorrência terá como `date` o primeiro dia do **mês mais antigo** em que o cliente registrou algum pagamento na V1.
- **Geração das Parcelas Filhas:** O script gerará transações filhas (instâncias) para todos os meses sequenciais desde essa data inicial até **12 meses no futuro** a partir do mês corrente.

### 3️⃣ Sincronização Fidedigna de Status (Bolinhas Coloridas)
- **Pagos (Verde):** Todo mês existente na tabela antiga como liquidado gerará a transação filha marcada como `status = 'paid'`, gravando o valor pago e a data de baixa original.
- **Atrasados (Vermelho):** Meses passados vencidos que constam em aberto ou inadimplentes na V1 gerarão registros na V2 com `status = 'pending'` (ou correspondente a atrasado), garantindo o indicativo visual correto.

---

> **Diretriz de Segurança:** A tabela `payments` permanecerá intacta na base de dados. O script de migração apenas copiará e interpretará os registros legados sob a ótica das novas regras, garantindo rastreabilidade histórica absoluta sem destruição de dados originais.

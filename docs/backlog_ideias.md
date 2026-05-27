# 📋 Backlog — Ideias e Tarefas Futuras

Este documento centraliza todas as ideias adiadas, bugs registrados e melhorias pendentes do projeto **Recebimento $mart**.

---

## 1. 🐛 Bugs Conhecidos

### 1.1. 🔔 Notificação de Erro Duplicada
* **Status:** Registrado em Mar/2026. Pendente de análise.
* **Descrição:** Ao ocorrer um erro, o usuário recebe duas notificações simultâneas: uma no canto superior direito e outra no canto inferior esquerdo.
* **Causa provável:** Presença de dois componentes `<Toaster>` montados na árvore de componentes (um no layout global e outro dentro de páginas específicas como `SubscriptionPageV2`).
* **Solução Recomendada:** Remover a instância duplicada, mantendo apenas o `<Toaster position="bottom-center" />` configurado no layout global.

### 1.2. 🚀 Rota `/cadastro` Não Encontrada
* **Status:** Causa raiz identificada (race condition após o processo de signup no `AuthContext.tsx`). Pendente validar correção definitiva.
* **Descrição:** O console exibe o aviso `No routes matched location "/cadastro"` durante o fluxo de navegação automática pós-registro ou login.

---

## 2. 💡 Planejamento de Ideias e Recursos Futuros

### 2.1. 💳 Cálculo Proporcional (Pró-rata) para Upgrade de Planos
* **Status:** Planejado (Requer nova branch).
* **Descrição:** Quando um usuário ativo de qualquer plano optar por fazer um upgrade para um plano superior, o sistema deve calcular dinamicamente o valor proporcional residual até o dia de vencimento original da assinatura.
* **Exemplo:** Assinatura básica feita no dia 10; no dia 30 o usuário faz upgrade para o Pro. O valor cobrado na transação de upgrade deve ser correspondente apenas ao período parcial (10 dias) restante. No vencimento normal (dia 10 do mês seguinte), a cobrança regular do plano Pro é cobrada inteira.
* **UX/UI:** Exibir de forma extremamente transparente na tela de assinatura: "O plano Pro custa R$ X. Migrando hoje, você pagará apenas R$ X-Y pelo período proporcional até DD/MM. A partir de DD/MM, a mensalidade será de R$ X."

### 2.2. 🤝 Novo Sistema de Indicações e Afiliados (Cashback Integral)
* **Status:** Planejado (Requer nova branch).
* **Descrição:** Substituir o desconto fixo de 20% por um programa de cashback integral. O usuário indicador recebe o valor cheio da primeira mensalidade paga pelo seu indicado.
* **Regras de Negócio:**
  * O resgate/pagamento via PIX só será liberado após o indicador acumular o valor mínimo de R$ 100,00 de saldo.
  * **Painel Administrativo:** O admin precisa visualizar detalhadamente quais indicados efetuaram pagamentos, o valor acumulado por indicador e receber notificações automáticas quando um indicador ultrapassar os R$ 100,00 pendentes para resgate.
  * **Painel do Usuário (Afiliado):** Apresentação visual limpa e transparente mostrando a lista de indicados, pagamentos realizados por eles e o saldo acumulado atual disponível/retirado.
  * **Solicitação de Saque:** O usuário deve possuir um campo direto na interface para cadastrar e gerenciar sua Chave PIX.
  * **Debitação:** Sempre que o administrador confirmar o pagamento do PIX, o sistema deve registrar a transação e abater o valor pago do saldo acumulado do usuário.

### 2.3. 💬 Chat de Suporte Administrativo
* **Status:** Temporariamente removido em Mar/2026 para readequação da interface V2.
* **Meta V2:** Reimplementar como `AdminChatPageV2.tsx` adotando os padrões visuais definidos (cantos arredondados, sombras suaves, chats em bolha e menu lateral de canais). Recomenda-se utilizar o `FeedbackDetailsV2.tsx` como ponto de partida visual.

### 2.4. 💳 Aprimoramento de Feedback da Tela de Pagamento
* **Status:** Pendente de implementação UI/UX.
* **Descrição:** Exibir indicações de progresso visual claras durante o processamento da cobrança (ex: "Redirecionando para plataforma segura...") e exibir dinamicamente a nova data de validade da assinatura do usuário logado logo após a confirmação de sucesso.

### 2.5. 🌟 Implementação do Plano Premium
* **Status:** Roadmap de Produto (Médio Prazo).
* **Descrição:** Implementar o plano **Premium** como uma terceira camada de escalabilidade no sistema, somando-se aos planos "Básico" e "Pró" já operantes.

### 2.6. 📧 Tela de Envio de E-mails em Massa (Admin)
* **Status:** Pendente. Infraestrutura backend já existe.
* **Rota sugerida:** `/v2/admin/broadcasts`
* **Descrição:** Criar página administrativa para compor e enviar e-mails em massa para todos os usuários ativos. Atualmente não existe nenhuma tela.

---

## 3. ✅ Histórico de Tarefas Concluídas

### 3.1. 📱 Menu de Ações (3 Pontinhos) no Cartão de Crédito no Celular
* **Status:** Concluído em Mai/2026.
* **Descrição:** Corrigida a propagação de eventos do clique e touch na div do dropdown da fatura de cartão de crédito, tanto em telas de computadores quanto em dispositivos celulares touch, resolvendo o bug visual onde o menu de ações não se mantinha aberto.

### 3.2. 👤 Remoção de CPF/CNPJ de Cadastros e Perfis
* **Status:** Concluído em Mai/2026.
* **Descrição:** Removido o campo `cpf_cnpj` do banco de dados (tabela `profiles`), triggers, formulários de cadastro legado e V2, e configurado fallback fictício para a API do Pagar.me a fim de manter integrações de PIX em funcionamento silencioso.

### 3.3. 📊 Melhorias na Tela de Lançamentos (UI/UX)
* **Status:** Concluído em Abr/2026.
* **Descrição:** Cores de valores previstos suaves (verde para positivo, vermelho para negativo), filtros fixos (sticky) no desktop e layout compactado lado a lado das buscas, filtros de mês e resumo em telas reduzidas.

### 3.4. 🔗 Integração de Webhooks
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.

### 3.5. 👑 Aprimoramento da Impersonação
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.

### 3.6. 💳 Migração de Gateway de Pagamento
* **Status:** Concluído em Mar/2026.
* **Descrição:** Substituição do Mercado Pago pelo Stripe concluída com sucesso.

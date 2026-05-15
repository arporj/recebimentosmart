# 📋 Backlog — Ideias e Tarefas Futuras

Este documento centraliza todas as ideias adiadas, bugs registrados e melhorias pendentes do projeto **Recebimento $mart**.

---

## 🐛 Bugs Conhecidos

### Notificação de Erro Duplicada
* **Status:** Registrado em Mar/2026. Pendente de análise.
* **Descrição:** Ao ocorrer um erro, o usuário recebe duas notificações simultâneas: uma no canto superior direito e outra no canto inferior esquerdo.
* **Causa provável:** Presença de dois componentes `<Toaster>` montados na árvore de componentes (um no layout global e outro dentro de páginas específicas como `SubscriptionPageV2`).
* **Solução Recomendada:** Remover a instância duplicada, mantendo apenas o `<Toaster position="bottom-center" />` configurado no layout global.

### Rota `/cadastro` Não Encontrada
* **Status:** Causa raiz identificada (race condition após o processo de signup no `AuthContext.tsx`). Pendente validar correção definitiva.
* **Descrição:** O console exibe o aviso `No routes matched location "/cadastro"` durante o fluxo de navegação automática pós-registro ou login.

---

## ✅ Histórico de Tarefas Concluídas

* **Integração de Webhooks:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.
* **Aprimoramento da Impersonação:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.
* **Migração de Gateway de Pagamento:** Substituição do Mercado Pago pelo Stripe concluída com sucesso em Março/2026. Atualizados arquivos `server.cjs` e `SubscriptionPageV2.tsx`.

---

## 💡 Planejamento de Ideias e Recursos Futuros

### 💬 Chat de Suporte Administrativo
* **Status:** Temporariamente removido em Mar/2026 para readequação da interface V2.
* **Histórico V1:**
  * A página `AdminChat.tsx` gerenciava conversas na rota restrita `/admin/chat`.
  * Utilizava o Supabase (`chats` e `messages`) para persistência em tempo real.
* **Meta V2:** Reimplementar como `AdminChatPageV2.tsx` adotando os padrões visuais definidos (cantos arredondados, sombras suaves, chats em bolha e menu lateral de canais). Recomenda-se utilizar o `FeedbackDetailsV2.tsx` como ponto de partida visual.

### 💳 Aprimoramento de Feedback da Tela de Pagamento
* **Status:** Pendente de implementação UI/UX.
* **Descrição:** Exibir indicações de progresso visual claras durante o processamento da cobrança (ex: "Redirecionando para plataforma segura...") e exibir dinamicamente a nova data de validade da assinatura do usuário logado logo após a confirmação de sucesso.

### 🌟 Implementação do Plano Premium
* **Status:** Roadmap de Produto (Médio Prazo).
* **Descrição:** Implementar o plano **Premium** como uma terceira camada de escalabilidade no sistema, somando-se aos planos "Básico" e "Pró" já operantes.

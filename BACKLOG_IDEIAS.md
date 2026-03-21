# Backlog — Ideias e Tarefas Futuras

Este documento centraliza todas as ideias adiadas, bugs registrados e melhorias pendentes do projeto.

---

## 🐛 Bugs Conhecidos

### Notificação de Erro Duplicada
**Status:** Registrado em Mar/2026. A analisar.
**Descrição:** Ao ocorrer um erro, o usuário recebe duas notificações simultâneas: uma no canto superior direito e outra no canto inferior esquerdo.
**Causa provável:** Dois `<Toaster>` montados na árvore de componentes (um no layout global e um dentro de páginas como `SubscriptionPageV2`).
**Ação:** Remover a instância duplicada, mantendo apenas o `<Toaster position="bottom-center" />` do layout global.

### Rota `/cadastro` Não Encontrada
**Status:** Causa raiz identificada (race condition após signup no `AuthContext.tsx`). Verificar se o comportamento foi corrigido.
**Descrição:** O console exibe `No routes matched location "/cadastro"` durante navegação após registro ou login.

---

## ✅ Tarefas Concluídas (Histórico)

- **Corrigir lógica de status de pagamento do cliente (Backend):** Webhook implementado e inserção na tabela `subscriptions` funcionando.
- **Melhorar página de admin e corrigir impersonação:** Lógica de impersonação no `AuthContext.tsx` corrigida para atualização completa do estado.
- **Substituir Mercado Pago pelo Stripe:** Migração concluída em Mar/2026. `server.cjs` e `SubscriptionPageV2.tsx` atualizados.

---

## 💡 Ideias e Funcionalidades Futuras

### Chat de Suporte Administrativo
**Status:** Removido em Mar/2026 — guardar para implementação futura.
**Contexto V1:**
- Página `AdminChat.tsx` gerenciava conversas na rota `/admin/chat` (acesso restrito).
- Integração com Supabase para armazenamento (`chats`/`messages`).
- Admins respondiam em tempo real a dúvidas de clientes.

**Quando reavivado:** Criar `AdminChatPageV2.tsx` seguindo os padrões do Stitch (`rounded-2xl`, chats em bolha, listagem lateral de canais). Inspirar-se no `FeedbackDetailsV2.tsx`.

### Melhorar Feedback Visual da Tela de Pagamento
**Status:** Pendente.
**Descrição:** Após iniciar o pagamento, exibir feedback claro ao usuário (ex: "Redirecionando para o pagamento...") e mostrar data de próximo vencimento dinamicamente após confirmação.

### Plano Premium
**Status:** Planejado para o futuro próximo.
**Descrição:** Adicionar o plano Premium como terceira opção de assinatura, além dos planos Básico e Pró já existentes.

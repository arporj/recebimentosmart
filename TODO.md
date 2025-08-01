# Lista de Tarefas e Melhorias Futuras

Este arquivo serve para rastrear tarefas, bugs de baixa prioridade e melhorias que devem ser abordadas no futuro.

## Itens Pendentes

- [x] **URGENTE: Corrigir lógica de status de pagamento do cliente (Backend)**
  - **Descrição:** O fluxo de backend para o primeiro pagamento foi implementado, incluindo o webhook do Mercado Pago e a inserção na tabela `subscriptions`.
  - **Status:** Concluído (Backend).

- [ ] **Melhorar feedback visual e exibição de próximo vencimento (Frontend)**
  - **Descrição:** Na tela de pagamentos, o usuário precisa de feedback visual claro após iniciar o pagamento (ex: "Aguardando confirmação...") e a data do próximo vencimento deve ser exibida e atualizada dinamicamente.
  - **Ação Sugerida:** Implementar polling na tabela `payment_transactions` para o `externalReference` e atualizar o `PaymentIntegration.tsx` para exibir o status e a data de vencimento.

- [ ] **Corrigir erro de Roteamento: `No routes matched location "/cadastro"`**
  - **Descrição:** O console do navegador exibe um aviso de que a rota `/cadastro` não foi encontrada. Isso provavelmente ocorre durante a navegação após o registro ou login.
  - **Ação Sugerida:** Investigar o código de roteamento (provavelmente em `App.tsx` e os componentes de página) para encontrar onde a navegação para `/cadastro` está sendo chamada e corrigir para a rota correta (ex: `/login` ou a página principal da aplicação após o login).

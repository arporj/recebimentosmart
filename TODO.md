# Lista de Tarefas e Melhorias Futuras

Este arquivo serve para rastrear tarefas, bugs de baixa prioridade e melhorias que devem ser abordadas no futuro.

## Itens Pendentes

- [ ] **URGENTE: Corrigir lógica de status de pagamento do cliente**
  - **Descrição:** Um cliente com data de vencimento futura (ex: 10 de Agosto) está sendo incorretamente marcado como "Em atraso: Agosto/2025". A tag principal mostra "Em dia", mas o status detalhado e o calendário indicam um atraso inexistente.
  - **Ação Sugerida:** Revisar a lógica de cálculo de status de pagamento no componente da página de clientes. A verificação de "atraso" deve considerar se a data de vencimento do mês atual já passou. Se a data de vencimento (ex: dia 10) do mês corrente ainda não chegou, o status não pode ser "em atraso".

- [ ] **Corrigir erro de Roteamento: `No routes matched location "/cadastro"`**
  - **Descrição:** O console do navegador exibe um aviso de que a rota `/cadastro` não foi encontrada. Isso provavelmente ocorre durante a navegação após o registro ou login.
  - **Ação Sugerida:** Investigar o código de roteamento (provavelmente em `App.tsx` e os componentes de página) para encontrar onde a navegação para `/cadastro` está sendo chamada e corrigir para a rota correta (ex: `/login` ou a página principal da aplicação após o login).
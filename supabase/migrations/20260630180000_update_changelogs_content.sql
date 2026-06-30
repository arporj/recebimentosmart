-- Alterar conteúdo dos changelogs históricos para uma linguagem amigável e em português do Brasil

UPDATE public.changelogs
SET description = '### Novidades
- **Assistente Financeiro por Voz (Artie) [Premium]**: Agora você pode usar sua própria voz para gerenciar seu dinheiro! Basta falar para cadastrar receitas e despesas, parcelar contas ou confirmar pagamentos. Se errar alguma palavra ou quiser desfazer, você tem 5 segundos para cancelar a ação com um clique.
- **Botão Rápido de Lançamento**: Adicionamos um menu no botão "Criar Lançamento" para você escolher direto se quer adicionar uma Despesa, uma Receita ou uma Transferência, poupando cliques no dia a dia.
- **Mudar Tipo de Conta Facilmente**: Agora você pode alterar uma despesa para receita ou transferência direto na tela de edição, sem precisar apagar e cadastrar tudo de novo.

### Alterações
- **Salvamento Automático de Preferências**: Suas preferências de visualização (como tema escuro e tamanho das tabelas) agora são salvas sozinhas conforme você usa o sistema.
- **Telas mais Limpas no Celular**: Ajustamos a listagem de contas no celular para esconder detalhes menos importantes e economizar espaço, facilitando a leitura de seus lançamentos.
- **Visualização Melhorada de Saldos**: As cores e fontes dos saldos previstos foram otimizadas para você diferenciar mais facilmente o que é saldo futuro dos pagamentos de hoje.

### Correções
- **Cálculo do Saldo Previsto**: Corrigimos o cálculo do saldo futuro na tela de detalhes da transação no celular e no computador.'
WHERE version = 'v2.1.0';

UPDATE public.changelogs
SET description = '### Novidades
- **Notificações por E-mail para Clientes**: Adicionamos uma nova ferramenta para envio de e-mails em lote, permitindo enviar comunicados ou novidades para todos os seus clientes de forma profissional.
- **Cálculo de Desconto ao Mudar de Plano**: Ao fazer a mudança para um plano superior, o sistema calcula automaticamente o desconto dos dias que você já pagou no plano antigo, cobrando apenas a diferença proporcional no PIX com total clareza.

### Alterações
- **Pagamento Direto via PIX**: Toda a nossa estrutura de pagamentos e assinaturas agora utiliza o Banco Inter PJ. Suas cobranças e assinaturas são processadas na hora e de forma integrada via PIX.
- **Mais Privacidade no Cadastro**: Removemos a exigência de preencher CPF ou CNPJ nos cadastros de perfis, tornando o processo de adesão mais rápido e seguro para sua privacidade.

### Correções
- **Ações de Contas no Celular**: Corrigimos o menu de opções dos cartões de crédito no celular, que antes sumia ou subia a tela incorretamente ao ser tocado.
- **Avisos Repetidos na Tela**: Corrigimos um erro que fazia com que os balões de avisos (notificações de sucesso/erro) aparecessem duplicados na tela.
- **Segurança ao Registrar Conta**: Corrigimos a tela de cadastro para evitar que usuários que já estão logados entrem em loops de páginas.'
WHERE version = 'v2.0.0';

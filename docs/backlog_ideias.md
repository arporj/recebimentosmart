# 📋 Backlog — Ideias e Tarefas Futuras

Este documento centraliza todas as ideias adiadas, bugs registrados e melhorias pendentes do projeto **Recebimento $mart**.

---

## 1. 🐛 Bugs Conhecidos

Nenhum bug conhecido ou ativo no momento. 🎉

---

## 2. 💡 Planejamento de Ideias e Recursos Futuros

### 2.1. 🤝 Novo Sistema de Indicações e Afiliados (Cashback Integral)
* **Status:** Planejado (Requer nova branch).
* **Descrição:** Substituir o desconto fixo de 20% por um programa de cashback integral. O usuário indicador recebe o valor cheio (integral) da primeira mensalidade paga pelo seu indicado na sua carteira de cashback. 
* **Regras de Negócio:**
  * **Regra de Desconto e Indicação:** O usuário que indicou (afiliado) acumula o **valor cheio/integral da primeira mensalidade** paga pelo indicado.
  * O resgate/pagamento via PIX só será liberado após o indicador acumular o valor mínimo de R$ 100,00 de saldo.
  * **Painel Administrativo:** O admin precisa visualizar detalhadamente quais indicados efetuaram pagamentos, o valor acumulado por indicador e receber notificações automáticas quando um indicador ultrapassar os R$ 100,00 pendentes para resgate.
  * **Painel do Usuário (Afiliado):** Apresentação visual limpa e transparente mostrando a lista de indicados, pagamentos realizados por eles e o saldo acumulado atual disponível/retirado.
  * **Solicitação de Saque:** O usuário deve possuir um campo direto na interface para cadastrar e gerenciar sua Chave PIX.
  * **Debitação:** Sempre que o administrador confirmar o pagamento do PIX, o sistema deve registrar a transação e abater o valor pago do saldo acumulado do usuário.

### 2.2. 💬 Chat de Suporte Administrativo (AdminChatPageV2.tsx)
* **Status:** Temporariamente removido em Mar/2026 para readequação da interface V2.
* **Descrição:** O sistema possuía anteriormente um chat de suporte interno que permitia a comunicação direta em tempo real entre o usuário/cliente final e o administrador do sistema.
* **Meta V2:** Reimplementar a interface do chat de suporte como `AdminChatPageV2.tsx` no painel do administrador e a interface correspondente no painel do cliente final, adotando os padrões visuais premium definidos na V2 (cantos arredondados, sombras suaves, bolhas de chat organizadas e um menu lateral limpo de canais/conversas ativas). Recomenda-se utilizar a tela de controle de feedbacks `FeedbackDetailsV2.tsx` como base e ponto de partida estético.

### 2.3. 🌟 Implementação do Plano Premium
* **Status:** Roadmap de Produto (Médio Prazo).
* **Descrição:** Implementar o plano **Premium** como uma terceira camada de escalabilidade no sistema, somando-se aos planos "Básico" e "Pró" já operantes. Esse plano deve englobar funcionalidades exclusivas de **atendimento via WhatsApp** e suporte avançado.

### 2.4. 🔔 Sistema de Notificações Mobile (Opção B Selecionada)
* **Status:** Planejado para Teste.
* **Descrição:** Desenvolver o mecanismo para o administrador receber notificações de chat e de novos feedbacks em tempo real no celular.
* **Opções Analisadas:**
  * **Opção A (Alternativa):** Mensagens Automáticas de Alerta via WhatsApp/Telegram pessoal. (Guardada para uso futuro se necessário).
  * **Opção B (ESCOLHIDA E MARCADA PARA TESTE):** Web Push Notifications via PWA. Configurar a plataforma como um Progressive Web App (PWA) instalável, permitindo o recebimento de notificações nativas na tela de bloqueio do celular (Android e iOS 16.4+) usando Service Workers e Edge Functions no Supabase.
  * **Opção C (Alternativa):** Aplicativo Mobile Nativo usando Capacitor. Mapeamento de Push FCM nativo. (Guardada para expansão futura).
* **Escopo Inicial de Teste (Feedbacks):**
  * Voltar a exibir a tela de **Feedback** para os usuários comuns no menu lateral do sistema.
  * Configurar a infraestrutura PWA básica no frontend.
  * Criar um trigger no banco (Supabase) e Edge Function de envio de Web Push para disparar uma notificação instantânea para o celular do Administrador sempre que qualquer usuário enviar um feedback no sistema.

### 2.5. 🤝 Lançamentos Compartilhados (Adiado / Temporariamente Desativado)
* **Status:** Adiado (Pendente de reavaliação de produto).
* **Descrição:** A funcionalidade de compartilhar lançamentos e resumos financeiros com parceiros por e-mail, incluindo notificações de badge em tempo real no menu hambúrguer e barra lateral, e sinal sonoro de notificação via Web Audio API. 
* **Regras de Negócio:**
  * A funcionalidade foi ocultada temporariamente do menu em Jun/2026.
  * A lógica e tabelas no banco de dados (`client_shares`, `financial_transactions.shared_by_user_id`, `shared_transaction_updates`) permanecem ativas e intactas.
  * Ao retomar a funcionalidade, readequar a interface do menu e reintroduzir os sinalizadores de notificação visual e sonora (chime) de forma otimizada.

---

## 3. ✅ Histórico de Tarefas Concluídas

### 3.1. 📱 Menu de Ações (3 Pontinhos) no Cartão de Crédito no Celular
* **Status:** Concluído em Mai/2026.
* **Descrição:** Corrigida a propagação de eventos do clique e touch na div do dropdown da fatura de cartão de crédito, tanto em telas de computadores quanto em dispositivos celulares touch, resolvendo o bug visual onde o menu de ações não se mantinha aberto.

### 3.2. 🔔 Notificação de Erro Duplicada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Validado que a duplicação de Toasters nas páginas internas foi inteiramente resolvida em limpezas de refatoração, mantendo Toasters isolados apenas em telas externas públicas e layouts centrais.

### 3.3. 🚀 Rota `/cadastro` Não Encontrada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Resolvido o erro de race condition do roteador adicionando redirecionamento seguro da rota de cadastro de usuário já autenticado direto para a listagem financeira no App.tsx.

### 3.4. 👤 Remoção de CPF/CNPJ de Cadastros e Perfis
* **Status:** Concluído em Mai/2026.
* **Descrição:** Removido o campo `cpf_cnpj` do banco de dados (tabela `profiles`), triggers, formulários de cadastro legado e V2, e configurado fallback fictício para a API do Pagar.me a fim de manter integrações de PIX em funcionamento silencioso.

### 3.5. 📊 Melhorias na Tela de Lançamentos (UI/UX)
* **Status:** Concluído em Abr/2026.
* **Descrição:** Cores de valores previstos suaves (verde para positivo, vermelho para negativo), filtros fixos (sticky) no desktop e layout compactado lado a lado das buscas, filtros de mês e resumo em telas reduzidas.

### 3.6. 🔗 Integração de Webhooks
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.

### 3.7. 👑 Aprimoramento da Impersonação
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.

### 3.8. 💳 Migração de Gateway de Pagamento
* **Status:** Concluído em Mar/2026.
* **Descrição:** Substituição do Mercado Pago pelo Stripe concluída com sucesso.

### 3.9. 💳 Cálculo Proporcional (Pró-rata) para Upgrade de Planos
* **Status:** Concluído em Mai/2026.
* **Descrição:** Implementação de cálculo dinâmico e reativo de pró-rata de assinatura quando usuários de planos ativos (ex: Básico) realizam upgrade para planos superiores (ex: Pró). O valor é calculado proporcionalmente aos dias restantes no ciclo mensal do usuário, abatendo créditos de indicação e atualizando a cobrança Pix do Banco Inter PJ de forma 100% dinâmica. Inclui banner informativo premium de total transparência financeira no checkout de assinaturas.

### 3.10. 📧 Tela de Envio de E-mails em Massa (Admin)
* **Status:** Concluído em Mai/2026.
* **Descrição:** Criada a página administrativa `AdminBroadcastV2.tsx` de alto nível para compor e realizar envios de e-mails em lote para toda a base de usuários ativos. A tela possui suporte nativo a tags HTML para estilização, inclusão de imagens coladas com upload direto ao Storage do Supabase, inserção de emojis e integração inteligente com o modelo Gemini Pro (API da Google) para otimização profissional de conteúdo.

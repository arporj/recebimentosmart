# ✅ Histórico de Tarefas Concluídas — Recebimento $mart

Este documento registra o histórico de bugs corrigidos, refatorações realizadas e novas funcionalidades que foram implementadas no sistema.

---

### 1. 📱 Menu de Ações (3 Pontinhos) no Cartão de Crédito no Celular
* **Status:** Concluído em Mai/2026.
* **Descrição:** Corrigida a propagação de eventos do clique e touch na div do dropdown da fatura de cartão de crédito, tanto em telas de computadores quanto em dispositivos celulares touch, resolvendo o bug visual onde o menu de ações não se mantinha aberto.

### 2. 🔔 Notificação de Erro Duplicada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Validado que a duplicação de Toasters nas páginas internas foi inteiramente resolvida em limpezas de refatoração, mantendo Toasters isolados apenas em telas externas públicas e layouts centrais.

### 3. 🚀 Rota `/cadastro` Não Encontrada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Resolvido o erro de race condition do roteador adicionando redirecionamento seguro da rota de cadastro de usuário já autenticado direto para a listagem financeira no App.tsx.

### 4. 👤 Remoção de CPF/CNPJ de Cadastros e Perfis
* **Status:** Concluído em Mai/2026.
* **Descrição:** Removido o campo `cpf_cnpj` do banco de dados (tabela `profiles`), triggers, formulários de cadastro legado e V2, e configurado fallback fictício para a API do Pagar.me a fim de manter integrações de PIX em funcionamento silencioso.

### 5. 📊 Melhorias na Tela de Lançamentos (UI/UX)
* **Status:** Concluído em Abr/2026.
* **Descrição:** Cores de valores previstos suaves (verde para positivo, vermelho para negativo), filtros fixos (sticky) no desktop e layout compactado lado a lado das buscas, filtros de mês e resumo em telas reduzidas.

### 6. 🔗 Integração de Webhooks
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.

### 7. 👑 Aprimoramento da Impersonação
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.

### 8. 💳 Migração de Gateway de Pagamento
* **Status:** Concluído em Mar/2026.
* **Descrição:** Substituição do Mercado Pago pela API do Banco Inter PJ concluída com sucesso.

### 9. 💳 Cálculo Proporcional (Pró-rata) para Upgrade de Planos
* **Status:** Concluído em Mai/2026.
* **Descrição:** Implementação de cálculo dinâmico e reativo de pró-rata de assinatura quando usuários de planos ativos (ex: Básico) realizam upgrade para planos superiores (ex: Pró). O valor é calculado proporcionalmente aos dias restantes no ciclo mensal do usuário, abatendo créditos de indicação e atualizando a cobrança Pix do Banco Inter PJ de forma 100% dinâmica. Inclui banner informativo premium de total transparência financeira no checkout de assinaturas.

### 10. 📧 Tela de Envio de E-mails em Massa (Admin)
* **Status:** Concluído em Mai/2026.
* **Descrição:** Criada a página administrativa `AdminBroadcastV2.tsx` de alto nível para compor e realizar envios de e-mails em lote para toda a base de usuários ativos. A tela possui suporte nativo a tags HTML para estilização, inclusão de imagens coladas com upload direto ao Storage do Supabase, inserção de emojis e integração inteligente com o modelo Gemini Pro (API da Google) para otimização profissional de conteúdo.

### 11. 📱 Otimização do Layout de Linha Fina no Mobile
* **Status:** Concluído em Jun/2026.
* **Descrição:** O padding vertical das linhas no celular agora se ajusta dinamicamente baseando-se no `rowDensity` (reduzindo-se para `py-1` no modo compacto). Além disso, a coluna de previsto acumulado e os metadados secundários (conta, categoria, cliente) são estritamente ocultados nas listagens mobile de faturas e transações comuns quando o espaçamento Fino está ativo, garantindo visualização em linha única limpa.

### 12. 💬 Saldo Previsto no Modal de Detalhes
* **Status:** Concluído em Jun/2026.
* **Descrição:** Adicionada a exibição do saldo previsto pós-lançamento (`runningBalance`) no modal de detalhes (`TransactionSummaryModal`), disponível de forma idêntica tanto para celular quanto para computadores de mesa.

### 13. ⚙️ Autosave das Preferências do Usuário
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementação de salvamento automático (autosave) em tempo real de todas as preferências visuais e de layout (tema, densidade, predictedLayout, etc.) no Supabase e LocalStorage. O nome completo do usuário também é salvo automaticamente via evento `onBlur`. Como consequência, a barra de ações manual (botões "Salvar" e "Descartar") foi inteiramente removida da interface do formulário de configurações.

### 14. 🎙️ Assistente Financeiro por Voz (Artie - Fase 1)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementação do assistente inteligente de voz do sistema (Artie). O usuário pode interagir por comandos falados para:
  * Criar lançamentos comuns, parcelados (ex: 10x) ou recorrentes (ex: mensal, anual) de forma dinâmica.
  * Confirmar/dar baixa em lançamentos pendentes com match aproximado de valor, descrição e data.
  * Excluir lançamentos existentes citando o nome, valor ou data.
  * Alterar campos (valor, descrição, data, conta, categoria) de lançamentos existentes de forma silenciosa (ex: *"altere o valor do almoço de hoje para 15 reais"*).
  * Execução silenciosa automática (sem abrir a mini modal) quando houver correspondência exata e sem ambiguidades no banco, reduzindo o atrito do usuário.
  * Interface premium de **Sucesso Silencioso** com barra de progresso linear, temporizador de 5 segundos, e botões de **Desfazer (Rollback)** e **Editar Lançamento**.
  * Guia de comandos falados completo exibido na mini modal de gravação de áudio com exemplos para cada ação.

### 15. 📊 Padronização do Saldo Previsto com Preferências do Usuário (UI/UX)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Padronizada a exibição do saldo previsto dinâmico para respeitar as preferências do usuário (`predictedLayout` e `rowDensity`). O estilo visual foi otimizado para usar fontes normais (sem negrito) e cores suaves customizadas (`text-previsto-positivo` em verde suave e `text-previsto-negativo` em vermelho suave), distinguindo-o claramente do valor do lançamento individual.

### 16. 💸 Edição de Tipo de Lançamento (Receita x Despesa)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Adicionado suporte à edição direta do tipo de lançamento (Despesa, Receita ou Transferência) na própria tela/modal de detalhes (`FinancialTransactionModalV2.tsx`) sem precisar apagar e recriar o lançamento do zero.

### 17. ➕ Menu Suspenso no Botão de Criar Lançamento (UI/UX)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementado menu suspenso de hover (hover dropdown) no botão principal "Criar Lançamento" na listagem de transações. Por padrão, clicar no botão abre o modal configurado para **Despesa**, e ao passar o mouse ele exibe atalhos rápidos com marcadores visuais para criar **🟢 Receita** ou **🔵 Transferência**.

### 18. 💳 Correção de Comportamento no Menu do Cartão de Crédito
* **Status:** Concluído em Jul/2026.
* **Descrição:** Corrigido o bug na tela de cartão de crédito onde clicar no menu de ações (3 pontinhos) de um lançamento executava um scroll indesejado para o topo e não mantinha o menu suspenso aberto.

### 19. 🔄 Refatoração de Recorrências para o Padrão Template/Contrato
* **Status:** Concluído em Jul/2026.
* **Descrição:** Refatoração do modelo de recorrência e tabelas para o padrão de contrato/template mãe (`is_template = true`) isolada no extrato e saldo, gerando automaticamente filhos físicos na criação e permitindo edições seguras de escopo e backfill retroativo robusto.

### 20. 🐛 Correção de Lançamentos de Meses Passados Exibidos no Mês Atual
* **Status:** Concluído em Jul/2026.
* **Descrição:** Corrigida a lógica da função `allInstancesUpToMonth` que incorretamente movia o `instanceDate` de transações não pagas do passado para o dia atual. Agora, essas transações permanecem em seus meses originais (apenas com a tag visual "atrasado"), e foi adicionado o filtro `is_template = false` nas queries principais de faturamento e extrato (DashboardV2, CreditCardV2 e RecurrenceV2).

### 21. 💡 Correção de Legibilidade do Modal de Recorrência no Modo Dark
* **Status:** Concluído em Jul/2026.
* **Descrição:** Ajustadas as classes Tailwind do componente `ModalOpcaoRecorrente.tsx` adicionando suporte completo ao modo dark (`dark:bg-slate-900`, `dark:text-slate-100`, `dark:border-slate-800`), resolvendo problemas de contraste e legibilidade de textos no tema escuro.

### 22. 🗑️ Remoção de Templates Recorrentes Fantasmas Zerados
* **Status:** Concluído em Jul/2026.
* **Descrição:** Criada migração no banco de dados para expurgar templates recorrentes órfãos e inativos com `amount = 0.00` e sem filhos físicos. Isso corrigiu o problema em que usuários (como Ricardo Cabral, André Ricardo e Alicia Galhano) viam dezenas de cobranças virtuais zeradas sendo projetadas nos meses futuros.

### 23. 🏷️ Campos Personalizados na Criação de Clientes
* **Status:** Concluído em Jul/2026.
* **Descrição:** Integrado suporte nativo para exibição e salvamento de campos personalizados (custom fields) diretamente no Step 1 do modal responsivo de cadastro rápido `NewClientWithTransactionModal.tsx`.

### 24. 📱 Otimização Responsiva da Gestão de Clientes no Mobile
* **Status:** Concluído em Jul/2026.
* **Descrição:** Substituído o grid original de KPIs e a tabela de 5 colunas por componentes específicos para mobile: KPIs com fonte flexível e truncamento de texto, e listagem de clientes convertida em cards empilhados (`block md:hidden`) com botões táteis no mobile, mantendo a tabela clássica somente para telas desktop.

### 25. 🎙️ Assistente IA Financeiro Conversacional (Artie Premium) — Backlog 1.4 completo
* **Status:** Concluído em Jul/2026.
* **Descrição:** Evolução completa do Artie para assistente conversacional contínuo e contextual (Gemini Flash com cascata de fallback), exclusivo do plano Premium (admins têm acesso para suporte/testes). Entregas: fluxo guiado de criação de lançamentos com chips clicáveis (tool `ask_user`) exigindo conta e categoria (guarda dura `slotGuard.ts` valida IDs reais e converte nome→id); cartão único assumido automaticamente; categorização inteligente que prioriza o histórico de classificações do próprio usuário (`categoryHints.ts`) com sugestão + confirmação; tons de conversa (Casual/Normal/Técnico) com seletor nas Preferências gravando em `artie_user_memory`; histórico de conversa persistido em `artie_messages` (sobrevive ao reload); consultas de saldo, gastos por categoria/período (com agregação de subcategorias) e contas em atraso (`overdue_only`); transferências entre contas comuns com validação de origem/destino; e fechamento/pagamento de fatura de cartão por conversa (tools `get_invoice_summary` + `pay_credit_card_invoice`), espelhando o fluxo da tela de Cartões via serviço extraído `pagarFatura.ts` (valor integral ou parcial com Acerto de Saldo, descarte ou rolagem da diferença para o mês seguinte, e agendamento com confirmação automática via cron `auto_confirm`).

### 26. 🔒 Correção Crítica de RLS Ausente em `clients` e `payments` (V1)
* **Status:** Concluído em Jul/2026.
* **Descrição:** Durante a auditoria de migração V1→V2 do backlog 1.6, foi descoberto que as tabelas legadas `public.clients` e `public.payments` nunca tiveram Row Level Security habilitado (`ENABLE ROW LEVEL SECURITY` nunca foi executado, apesar de já existirem policies de dono/admin/compartilhamento criadas fora do controle de versão). Isso permitia que qualquer usuário autenticado lesse e escrevesse os clientes e o histórico de pagamentos de qualquer outro usuário via PostgREST. Corrigido pela migração `20260721140000_enable_rls_clients_payments.sql`, que habilita RLS em ambas as tabelas e adiciona a policy básica de dono (`auth.uid() = user_id`) que nunca existia. Validado com um usuário real não-admin (antes via da conta de teste vazando 77 clientes de terceiros; depois isolado corretamente).

### 27. 🧹 Remoção do Módulo Órfão `RecurrenceV2` e Auditoria de Importação V1→V2
* **Status:** Concluído em Jul/2026.
* **Descrição:** Confirmado (via auditoria direta no banco) que todos os clientes ativos já estão migrados para a V2 (possuem `financial_transactions` com `recurrence_enabled = true`), fruto da migração em massa de Abr/2026 (`20260414195600_migrate_client_data_to_transactions.sql`). A tela `RecurrenceV2.tsx` (rota `/v2/recorrencia`), que continha os botões manuais "Importar Histórico V1→V2", estava órfã — havia uma rota duplicada em `App.tsx` que sempre redirecionava `/v2/recorrencia` para `/v2/clientes/gestao` antes da rota que renderizava `RecurrenceV2` ser alcançada, e nenhum item de menu apontava mais para ela. Arquivo e rota morta removidos.

### 28. 🏷️ Exibição de Campos Personalizados na Gestão de Clientes (Backlog 1.6)
* **Status:** Concluído em Jul/2026.
* **Descrição:** `GestaoClientesV2.tsx` agora busca `custom_fields` e `client_custom_field_values` do usuário e exibe os valores preenchidos como chips abaixo do nome do cliente, tanto nos cards mobile quanto na tabela desktop — somente leitura, sem alteração de schema. Complementarmente, o botão da primeira aba (Dados do Cliente) do `NewClientWithTransactionModal.tsx` foi renomeado de "Próximo" para "Salvar e Continuar", deixando explícito que o cliente já é persistido no clique, antes de avançar para o lançamento inicial.

### 29. 🕵️ Paridade Total de Impersonação de Admin + Bloqueio de `password_reset_tokens`
* **Status:** Concluído em Jul/2026.
* **Descrição:** Usuário reportou que campos personalizados de um cliente (`gilbertocasemiro@hotmail.com`) sumiam ao impersonar. Causa: a impersonação é puramente client-side (`AuthContext.impersonateUser` só troca o objeto `user` em memória; a sessão real no Supabase continua sendo a do admin, então `auth.uid()` no banco nunca muda). Isso só funciona para tabelas que têm uma policy extra de bypass para admin (`fn_is_admin()`/`is_admin(auth.uid())`) — e `custom_fields` e `client_custom_field_values` nunca tiveram essa policy, além de várias outras tabelas só terem bypass de `SELECT` (não permitindo editar/excluir como o usuário impersonado). A migração `20260722090000_admin_full_impersonation_access_and_lockdown_reset_tokens.sql` adiciona/upgrada para policies `FOR ALL` (SELECT/INSERT/UPDATE/DELETE) em: `clients`, `payments`, `financial_transactions`, `financial_accounts`, `financial_categories`, `financial_tags`, `transaction_tags`, `client_shares`, `profiles`, `custom_fields`, `client_custom_field_values`, `client_notification_settings`, `notifications`, `referral_credits`, `referrals`, `payment_transactions`, `pix_transactions` e `user_transaction_usage`. Ficaram de fora `plans`/`app_settings` (config global, não é dado de usuário). Nota: ações que dependem do e-mail do JWT (ex.: aceitar convite de compartilhamento como destinatário) continuam limitadas durante a impersonação, já que o e-mail autenticado real continua sendo o do admin. Na mesma migração, foi corrigida uma segunda falha crítica encontrada na auditoria: `password_reset_tokens` tinha SELECT/INSERT/DELETE liberados para os papéis `anon` e `authenticated` com `USING (true)` — qualquer pessoa, sem login, conseguia ler ou apagar tokens de redefinição de senha de qualquer conta via API pública do PostgREST (risco de takeover de conta). As policies abertas foram removidas; o fluxo legítimo (`server/lib/passwordResetService.js`) já usa a `service_role` key, que ignora RLS por padrão, então nada quebrou. Tudo validado com simulação de RLS via `supabase db query` (usuário admin real vs. usuário comum real) e teste end-to-end no navegador impersonando o próprio Gilberto.

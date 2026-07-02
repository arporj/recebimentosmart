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

# 📋 Backlog — Ideias e Recursos Futuros (Unificado)

Este documento centraliza todas as ideias planejadas, melhorias pendentes e tendências de mercado para o desenvolvimento do **Recebimento $mart**. O sistema adota um modelo híbrido, atendendo tanto ao controle financeiro pessoal/familiar quanto à gestão comercial de reembolsos de amigos e clientes.

O histórico de tarefas que já foram concluídas foi movido para o arquivo [historico_tarefas_concluidas.md](file:///c:/Projetos/MEGAsync/Projetos/gemini-cli/recebimento-smart/docs/historico_tarefas_concluidas.md).

---

## 1. 💡 Recursos Planejados e Ideias Futuras

### 1.1. Indicações e Afiliados

#### 🤝 Novo Sistema de Indicações e Afiliados (Cashback Integral)

* **Status:** Planejado (Prioridade Média).
* **Descrição:** Substituição do desconto fixo de indicação de 20% por um programa de cashback integral. O usuário indicador recebe o valor cheio (integral) da primeira mensalidade paga pelo indicado.
* **Regras de Negócio:**
  * O afiliado acumula o valor integral da primeira mensalidade paga pelo indicado na sua carteira de cashback.
  * O resgate via PIX só é liberado ao acumular o valor mínimo de R$ 100,00.
  * **Painel Administrativo:** Exibe indicados, pagamentos realizados, saldos acumulados e envia notificações de solicitação de resgate.
  * **Painel do Usuário:** Interface transparente para o acompanhamento dos indicados, cadastramento da Chave PIX e solicitação de saque de cashback.

---

### 1.2. Canais de Atendimento e Notificações

#### 💬 Chat de Suporte Administrativo (AdminChatPageV2)

* **Status:** Temporariamente desativado para readequação.
* **Descrição:** Reimplementação da interface do chat de suporte (tempo real entre cliente final e administrador) como `AdminChatPageV2.tsx`, adotando os padrões visuais premium V2 (cantos arredondados, sombras suaves e sidebar de canais ativos). O design deve se basear na tela `FeedbackDetailsV2.tsx`.

#### 🔔 Sistema de Notificações Mobile (PWA Web Push)

* **Status:** Planejado para Testes.
* **Descrição:** Permitir que o administrador e os usuários recebam notificações de chat e novos feedbacks em tempo real na tela de bloqueio do celular (Android e iOS 16.4+) configurando a plataforma como um Progressive Web App (PWA) instalável com Service Workers e Edge Functions no Supabase.

#### 📲 Régua de Cobrança e Notificações via WhatsApp (API Business)

* **Status:** Roadmap (Médio Prazo).
* **Descrição:** Integração com a WhatsApp Business API para envio automatizado de lembretes de vencimento amigáveis (reembolsos e cobranças) e mensagens de confirmação de pagamento. Facilita o envio do Pix Copia e Cola diretamente no celular de amigos ou clientes sem atrito pessoal.

---

### 1.3. Modelos de Assinatura e Planos

#### 💳 Integração de Cartão de Crédito para Assinaturas

* **Status:** Planejado.
* **Descrição:** Inclusão de suporte a pagamentos e upgrades de planos via Cartão de Crédito no sistema, definindo um gateway integrado (ex: Stripe ou Asaas) que funcione de forma complementar ao Pix atual.

---

### 1.4. Inteligência Artificial

*(O Assistente IA Financeiro Conversacional — Artie Premium — foi concluído em Jul/2026; ver item 25 do [historico_tarefas_concluidas.md](file:///c:/Projetos/MEGAsync/Projetos/gemini-cli/recebimento-smart/docs/historico_tarefas_concluidas.md).)*

#### 🤖 Artie Full-Control — Cobertura de Todas as Ações do Sistema

* **Status:** Em andamento (Prioridade Alta).
* **Objetivo:** o Artie (chat e comando de voz, `src/lib/artie/executor.ts` + `tools.ts`, espelhado em `netlify/functions/artie-shared.cjs`) deve ser capaz de executar qualquer ação que hoje só existe manualmente nas telas do sistema, não só criar/consultar lançamentos. A lista abaixo cobre todas as telas do usuário Premium (não-admin) e serve de checklist de progresso — marcar `[x]` conforme cada ação for implementada como tool.
* **Fora de escopo por ora (não marcar aqui):**
  * Painel **Admin** (`/v2/admin/*`) — ações administrativas (gestão de usuários, broadcast, testes de sistema) não devem ser expostas a um assistente conversacional por risco de segurança, mesmo para admins.
  * **Lançamentos Compartilhados** (`SharedWithMeV2`) — módulo adiado (ver 1.6), não faz sentido automatizar antes da reavaliação de produto.
  * **Cashback/PIX de Indicações** — depende do novo sistema de cashback (ver 1.1), que ainda não foi construído; hoje o programa de indicação é só desconto automático.

**✅ Já suportado (Fase 1 — lançamentos, fatura e saldo):**
* [x] Criar lançamento (única, parcelada, recorrente, transferência entre contas)
* [x] Confirmar (dar baixa) em lançamento pendente
* [x] Editar lançamento (descrição, valor, data, conta, categoria, status)
* [x] Excluir lançamento (com escolha de escopo: este/próximos/todos)
* [x] Listar/consultar lançamentos (gastos, receitas, pendências, atrasados)
* [x] Consultar saldo de conta (atual, projetado, por data de corte)
* [x] Consultar resumo de fatura de cartão de crédito
* [x] Fechar/pagar fatura de cartão (integral, parcial com Acerto de Saldo, agendada)

**⬜ Lançamentos — ações que faltam:**
* [ ] Trocar modalidade de um lançamento existente (única ↔ parcelada ↔ recorrente) — backend já suporta via `mudarModalidadeTransacao`, só falta expor como tool
* [ ] Clonar um lançamento existente
* [ ] Confirmar com a data de hoje (distinto de confirmar na data original)
* [ ] Desconfirmar (reverter para pendente) um lançamento já pago
* [ ] Ações em lote (confirmar/desconfirmar/excluir vários lançamentos de uma vez)
* [ ] Atribuir/remover tags de um lançamento
* [ ] Aplicar filtro na tela de Lançamentos (tipo, status, conta, busca por texto, mês) — hoje `list_transactions` só responde a pergunta em texto, não altera o estado visual dos filtros da tela como o usuário faria manualmente

**⬜ Contas Bancárias (`FinancialAccountsV2`):**
* [ ] Criar conta (corrente/poupança/investimento/cartão de crédito)
* [ ] Editar conta (nome, saldo inicial, tipo)
* [ ] Excluir conta
* [ ] Definir conta como principal
* [ ] Vincular/editar cartão secundário de uma conta

**⬜ Categorias (`FinancialCategoriesV2`):**
* [ ] Criar categoria e subcategoria
* [ ] Editar categoria/subcategoria
* [ ] Excluir categoria/subcategoria

**⬜ Tags (`FinancialTagsV2`):**
* [ ] Criar tag (nome + cor)
* [ ] Editar tag
* [ ] Excluir tag

**⬜ Cartões de Crédito (`CreditCardV2`) — além do pagamento de fatura já suportado:**
* [ ] Fechar fatura manualmente antes do vencimento
* [ ] Reabrir fatura já fechada

**⬜ Clientes e Cobranças (módulo de reembolsos/gestão comercial — `GestaoClientesV2`, `CobrancasV2`):**
* [ ] Criar cliente
* [ ] Editar cliente
* [ ] Excluir cliente
* [ ] Lançamento rápido vinculado a um cliente
* [ ] Consultar extrato de um cliente
* [ ] Marcar cobrança de cliente como paga
* [ ] Enviar notificação/lembrete de cobrança a um cliente
* [ ] Configurar notificações automáticas (individuais por cliente ou globais)

**⬜ Campos Personalizados (`CamposPersonalizadosV2`):**
* [ ] Criar/editar/excluir campo personalizado
* [ ] Preencher valor de campo personalizado para um cliente

**⬜ Relatórios (`ReportsV2`):**
* [ ] Consultar relatórios (clientes ativos/atrasados/pagos no mês)
* [ ] Exportar base de clientes

**⬜ Indicações (`ReferralPageV2`):**
* [ ] Consultar estatísticas de indicados e desconto acumulado
* [ ] Gerar/compartilhar link de indicação

**⬜ Assinatura (`SubscriptionPageV2`):**
* [ ] Consultar plano atual e limites de uso
* [ ] Trocar de plano

**⬜ Perfil e Preferências (`UserProfileSettingsV2`):**
* [ ] Editar dados de perfil
* [ ] Ajustar preferências de exibição (tema, densidade, símbolo de moeda, layout de valores)
* [ ] Trocar o próprio tom de conversa do Artie (casual/normal/técnico)
* [ ] Ativar/desativar notificações por e-mail (vencimento, fatura)

**⬜ Feedback e Suporte (`FeedbackV2`):**
* [ ] Abrir um novo feedback/chamado de suporte via chat

---

### 1.5. Relatórios, Extratos e Conciliação (Premium)

#### 📊 Relatórios Financeiros Híbridos e DRE (Pessoal + Reembolsos)

* **Status:** Roadmap (Médio Prazo).
* **Descrição:** Nova tela inicial e relatórios avançados desenhados para o modelo híbrido:
  * **Segregação de Despesas:** Gráficos que separam o custo de vida pessoal real de adiantamentos/reembolsos a receber de terceiros, impedindo a distorção do orçamento real.
  * **Dashboard Pessoal com Card de Reembolsos:** Foco no saldo pessoal, mas incluindo cards dinâmicos indicando valores pendentes de reembolso de terceiros.
  * **DRE Pessoal mensalizado:** Comparação de Receitas -> (-) Custos Fixos -> (-) Custos Variáveis -> Margem de Sobra. Os reembolsos entram como amortização de custos e não receita bruta.
  * **Regime de Caixa vs. Competência:** Visualização do impacto das parcelas de cartões de crédito no mês de compra (decisão) vs. mês de pagamento (saída).

#### 📑 Extrato Unificado com Filtros e Badges

* **Status:** Roadmap (Médio Prazo).
* **Descrição:** Exibição do extrato de transações de forma unificada para bater centavo por centavo com a conta do banco (Verdade do Banco), mas incluindo filtros rápidos (`[Tudo] [Apenas Pessoal] [Apenas Reembolsos]`) e tags visuais indicadoras contendo o nome do familiar/cliente atrelado à despesa dividida.

#### 🔗 Open Finance e Conciliação Bancária Automática

* **Status:** Roadmap (Longo Prazo).
* **Descrição:** Conectividade de contas bancárias em tempo real via Open Finance (usando APIs como Pluggy ou Belvo) para importação, categorização e conciliação de extratos de forma automática e integrada ao dashboard do usuário.

#### 📁 Gestão de Documentos e Comprovantes

* **Status:** Planejado.
* **Descrição:** Possibilidade de upload e anexo de documentos (contratos, notas fiscais, fotos de recibos e comprovantes de transferência) diretamente atrelados a transações ou clientes, armazenando-os de forma segura no Supabase Storage.

---

### 1.6. Gestão Multiusuário e Compartilhamento

*(A exibição de campos personalizados na Gestão de Clientes, a auditoria de migração V1→V2, a remoção do módulo órfão `RecurrenceV2` e a correção crítica de RLS ausente em `clients`/`payments` foram concluídas em Jul/2026; ver itens 26, 27 e 28 do [historico_tarefas_concluidas.md](file:///c:/Projetos/MEGAsync/Projetos/gemini-cli/recebimento-smart/docs/historico_tarefas_concluidas.md).)*

#### 🤝 Reativação de Lançamentos Compartilhados

* **Status:** Adiado (Pendente de reavaliação de produto).
* **Descrição:** Reativação e readequação de layout do menu de compartilhamento de lançamentos por e-mail com parceiros, com alertas sonoros (Web Audio API) e badges de notificação em tempo real. As tabelas (`client_shares`, etc.) e triggers permanecem ativas no banco.

#### 💸 Split de Despesas Pessoais (Viagens e Jantares)

* **Status:** Roadmap (Longo Prazo).
* **Descrição:** Ferramenta dedicada a divisão rápida de custos de despesas pontuais e de lazer (jantares, viagens em grupo), dividindo os custos de forma igual ou proporcional entre os participantes e gerando as pendências de reembolsos Pix correspondentes.

#### ⚙️ Ajuste e Descontos de Pontualidade para Reembolsos

* **Status:** Roadmap.
* **Descrição:** Configuração opcional de juros amigáveis para acertos atrasados de contas ou abonos e descontos para depósitos antecipados.

#### 👥 Multi-empresa e Permissões Granulares (RBAC)

* **Status:** Roadmap (Médio Prazo).
* **Descrição:** Gestão de múltiplas contas comerciais/pessoais (CNPJs diferentes) sob o mesmo perfil, com controle estrito de acessos baseado em cargos (RBAC) para colaboradores ou contadores.

#### 📊 Integração Contábil Simplificada para Contadores

* **Status:** Roadmap.
* **Descrição:** Módulo de exportação de dados em formatos compatíveis com os principais softwares contábeis nacionais (OFX, CSV customizados) e API segura de extração autorizada de dados financeiros por contadores externos.

---

### 1.7. Interface e Mobile

*(O total previsto no agrupamento de contas da tela de Lançamentos foi concluído em Jul/2026; ver item 30 do [historico_tarefas_concluidas.md](file:///c:/Projetos/MEGAsync/Projetos/gemini-cli/recebimento-smart/docs/historico_tarefas_concluidas.md).)*

#### 📱 Aplicativo Mobile do Sistema (Híbrido)

* **Status:** Roadmap (Longo Prazo).
* **Descrição:** Aplicativo nativo ou híbrido (Capacitor/React Native) para iOS e Android com login biométrico (FaceID/TouchID), experiência focada em dispositivos móveis e notificações push nativas de faturas e lembretes.

#### 🍿 Painel de Controle de Assinaturas Pessoais (Streaming/SaaS)

* **Status:** Roadmap.
* **Descrição:** Painel para o usuário centralizar o acompanhamento de custos fixos pessoais recorrentes (Netflix, Spotify, academia, plano de celular), com alertas de reajuste anual e projeção de impacto desses custos a longo prazo.

#### 📋 Clonar Lançamento Deve Abrir a Tela de Criação, Não Salvar Direto

* **Status:** Planejado.
* **Descrição:** Hoje o botão "Clonar" (`handleClone` em `FinancialTransactionsV2.tsx`) insere um novo lançamento pendente diretamente no banco, com a mesma data e descrição "(cópia)" do original, sem qualquer tela intermediária. O comportamento correto é abrir a tela/modal de criação de lançamento (`FinancialTransactionModalV2`) já pré-preenchida com os dados do lançamento clicado (descrição, valor, conta, categoria, modalidade etc.), permitindo ao usuário revisar e ajustar (ex: mudar a data, o valor) antes de confirmar a criação — igual a um "novo lançamento a partir deste", nunca uma duplicação automática e silenciosa.
* **Impacto:** Reaproveita o modal de criação já existente, só muda o gatilho de `handleClone` (que hoje faz `insert` direto) para abrir o modal com valores iniciais. Vale também alinhar o item "Clonar um lançamento existente" do checklist do Artie (seção 1.4) para seguir a mesma regra — quando via chat/voz, o Artie deve apresentar os dados clonados para confirmação antes de criar, nunca criar direto.

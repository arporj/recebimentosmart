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

#### 🌟 Implementação do Plano Premium
* **Status:** Roadmap (Médio Prazo).
* **Descrição:** Criação da terceira camada de planos (Premium), somando-se ao Básico e Pró. Esse plano englobará recursos avançados como integrações externas e atendimento via WhatsApp.

---

### 1.4. Inteligência Artificial

#### 🎙️ Assistente IA Financeiro Conversacional (Artie Premium)
* **Status:** Roadmap (Longo Prazo).
* **Descrição:** Evolução do Artie (assistente por voz) para um modelo conversacional contínuo e contextual de IA (Gemini Pro):
  * **Categorização Inteligente:** Categorização automática de despesas e receitas baseando-se no histórico anterior.
  * **Tons de Conversa Customizáveis:** Escolha entre tom Casual (amigável e informal), Normal ( prático e equilibrado) ou Técnico (focado em contabilidade, DRE e termos matemáticos).
  * **Operações Inline Contextuais:** Geração de transações e agendamentos executados silenciosamente em segundo plano a partir da conversa, sem necessidade de formulários.

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

#### 📱 Aplicativo Mobile do Sistema (Híbrido)
* **Status:** Roadmap (Longo Prazo).
* **Descrição:** Aplicativo nativo ou híbrido (Capacitor/React Native) para iOS e Android com login biométrico (FaceID/TouchID), experiência focada em dispositivos móveis e notificações push nativas de faturas e lembretes.

#### 📱 Otimização Mobile da Tela de Lançamentos
* **Status:** Planejado.
* **Descrição:** Otimizar o aproveitamento de espaço em celulares, reduzindo fontes de valores e descrições para a mesma dimensão menor das datas, aumentando o número de lançamentos visíveis simultaneamente na tela sem precisar de rolagem profunda.

#### 🍿 Painel de Controle de Assinaturas Pessoais (Streaming/SaaS)
* **Status:** Roadmap.
* **Descrição:** Painel para o usuário centralizar o acompanhamento de custos fixos pessoais recorrentes (Netflix, Spotify, academia, plano de celular), com alertas de reajuste anual e projeção de impacto desses custos a longo prazo.

# 📋 Backlog — Ideias e Tarefas Futuras

Este documento centraliza todas as ideias adiadas, bugs registrados e melhorias pendentes do projeto **Recebimento $mart**, um sistema híbrido voltado para controle financeiro pessoal/familiar e gestão de clientes comerciais ou compartilhamento de contas/reembolsos com amigos e familiares.

---

## 1. 🐛 Bugs Conhecidos

* Nenhum bug conhecido registrado no momento.

---

## 2. 💡 Planejamento de Ideias e Recursos Futuros

### 2.1. 🔄 Refatoração de Recorrências para o Padrão Template/Contrato (Prioritário)
* **Status:** Planejado (Prioridade Alta).
* **Descrição:** Refatorar o modelo de recorrência do sistema para adotar o padrão de **Template de Recorrência** (ou assinatura), onde o registro principal criado no banco de dados funciona puramente como um configurador/gerador (contrato) que nunca entra diretamente no saldo nem aparece na listagem financeira.
* **Principais Requisitos:**
  * **Registro Template (Mãe Isolado):** A transação configuradora do ciclo recebe a flag `is_template = true` e fica oculta das consultas reativas de saldo e transações diárias.
  * **Geração Automática do Primeiro Filho:** No momento da criação da recorrência, o backend gera imediatamente a primeira transação física filha associada a ela.
  * **Edições Seguras:** Edições no escopo "Apenas este" atualizam a transação física filha correspondente, deixando o template mãe seguro contra edições acidentais que afetariam futuros períodos.
  * **Migração de Dados (Backfill):** Criar script de migração para as transações recorrentes e parceladas existentes, adaptando-as para a nova modelagem de templates e filhos.

### 2.2. 🤝 Novo Sistema de Indicações e Afiliados (Cashback Integral)
* **Status:** Planejado (Requer nova branch).
* **Descrição:** Substituir o desconto fixo de 20% por um programa de cashback integral. O usuário indicador recebe o valor cheio (integral) da primeira mensalidade paga pelo seu indicado na sua carteira de cashback. 
* **Regras de Negócio:**
  * **Regra de Desconto e Indicação:** O usuário que indicou (afiliado) acumula o **valor cheio/integral da primeira mensalidade** paga pelo indicado.
  * O resgate/pagamento via PIX só será liberado após o indicador acumular o valor mínimo de R$ 100,00 de saldo.
  * **Painel Administrativo:** O admin precisa visualizar detalhadamente quais indicados efetuaram pagamentos, o valor acumulado por indicador e receber notificações automáticas quando um indicador ultrapassar os R$ 100,00 pendentes para resgate.
  * **Painel do Usuário (Afiliado):** Apresentação visual limpa e transparente mostrando a lista de indicados, pagamentos realizados por eles e o saldo acumulado atual disponível/retirado.
  * **Solicitação de Saque:** O usuário deve possuir um campo direto na interface para cadastrar e gerenciar sua Chave PIX.
  * **Debitação:** Sempre que o administrador confirmar o pagamento do PIX, o sistema deve registrar a transação e abater o valor pago do saldo acumulado do usuário.

### 2.3. 💬 Chat de Suporte Administrativo (AdminChatPageV2.tsx)
* **Status:** Temporariamente removido em Mar/2026 para readequação da interface V2.
* **Descrição:** O sistema possuía anteriormente um chat de suporte interno que permitia a comunicação direta em tempo real entre o usuário/cliente final e o administrador do sistema.
* **Meta V2:** Reimplementar a interface do chat de suporte como `AdminChatPageV2.tsx` no painel do administrador e a interface correspondente no painel do cliente final, adotando os padrões visuais premium definidos na V2 (cantos arredondados, sombras suaves, bolhas de chat organizadas e um menu lateral limpo de canais/conversas ativas). Recomenda-se utilizar a tela de controle de feedbacks `FeedbackDetailsV2.tsx` como base e ponto de partida estético.

### 2.4. 🌟 Implementação do Plano Premium
* **Status:** Roadmap de Produto (Médio Prazo).
* **Descrição:** Implementar o plano **Premium** como uma terceira camada de escalabilidade no sistema, somando-se aos planos "Básico" e "Pró" já operantes. Esse plano deve englobar funcionalidades exclusivas de **atendimento via WhatsApp** e suporte avançado.

### 2.5. 🔔 Sistema de Notificações Mobile (Opção B Selecionada)
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

### 2.6. 🤝 Lançamentos Compartilhados (Adiado / Temporariamente Desativado)
* **Status:** Adiado (Pendente de reavaliação de produto).
* **Descrição:** A funcionalidade de compartilhar lançamentos e resumos financeiros com parceiros por e-mail, incluindo notificações de badge em tempo real no menu hambúrguer e barra lateral, e sinal sonoro de notificação via Web Audio API. 
* **Regras de Negócio:**
  * A funcionalidade foi ocultada temporariamente do menu em Jun/2026.
  * A lógica e tabelas no banco de dados (`client_shares`, `financial_transactions.shared_by_user_id`, `shared_transaction_updates`) permanecem ativas e intactas.
  * Ao retomar a funcionalidade, readequar a interface do menu e reintroduzir os sinalizadores de notificação visual e sonora (chime) de forma otimizada.

### 2.7. 📱 Aplicativo Mobile do Sistema
* **Status:** Roadmap de Produto (Longo Prazo).
* **Descrição:** Desenvolvimento de um aplicativo móvel dedicado (híbrido via React Native/Capacitor ou PWA nativo aprimorado) para dispositivos iOS e Android. O aplicativo fornecerá acesso rápido e otimizado às funcionalidades do RecebimentoSmart na palma da mão do usuário.
* **Principais Funcionalidades:**
  * **Notificações Push Nativas:** Alertas imediatos de faturas geradas, confirmações de pagamento via PIX, lembretes de cobrança e novos feedbacks/mensagens de suporte.
  * **Acesso Otimizado:** Login rápido via biometria (FaceID/TouchID).
  * **Gestão e Lançamentos Rápidos:** Criação simplificada de clientes, emissão de cobranças rápidas e consulta a relatórios essenciais em layout Mobile-First premium.

### 2.8. 💳 Integração de Cartão de Crédito para Assinaturas e Pagamentos
* **Status:** Planejado.
* **Descrição:** Incluir suporte a pagamentos e assinaturas via Cartão de Crédito no sistema. A ferramenta/gateway de pagamento a ser utilizada para a transação ainda será definida (ex: Stripe, Asaas, etc.).

### 2.9. 📱 Otimização Mobile da Tela de Lançamentos
* **Status:** Planejado.
* **Descrição:** Melhorar a disposição e o aproveitamento de espaço dos lançamentos na tela de lançamentos em dispositivos móveis. Ajustar o tamanho da fonte da descrição e do valor para que fiquem no mesmo tamanho menor da fonte da data, aumentando a densidade de informações exibidas e permitindo visualizar mais itens na tela.

### 2.10. 💬 IA Conversacional Ativa de Organização Financeira (Artie Premium)
* **Status:** Roadmap de Produto (Longo Prazo).
* **Descrição:** Evoluir o Artie para se tornar uma IA financeira 100% conversacional e responsiva. O usuário poderá interagir com a IA por meio de uma conversa fluida e contínua (seja por voz ou por texto) para organizar suas finanças cotidianas.
* **Principais Funcionalidades:**
  * **Tons de Conversa Customizáveis:** O usuário poderá escolher o tom de voz e estilo de resposta do Artie, variando entre:
    * *Casual:* Um papo descontraído, amigável e informal, ideal para o dia a dia.
    * *Normal:* Um tom profissional equilibrado, focado em clareza e praticidade.
    * *Técnico:* Respostas detalhadas, análises profundas de métricas, termos contábeis e gráficos, ideal para quem busca precisão matemática e contábil.
  * **Operações Inline Contextuais:** As ações financeiras (criar lançamentos, pagar faturas, alterar valores, agendar contas) serão extraídas e realizadas de forma inteligente e automática em segundo plano *à medida que a conversa se desenvolve*, eliminando a necessidade de comandos isolados ou formulários.

### 2.11. 🔔 Régua de Cobrança de Reembolsos e Divisões (Amigos e Familiares)
* **Status:** Planejado (Roadmap).
* **Descrição:** Permitir o envio automatizado e amigável de notificações (WhatsApp, E-mail ou SMS) para familiares ou amigos que compartilham contas com o usuário (ex: reembolso de plano de saúde, aluguel dividido), facilitando o envio do Pix Copia e Cola e lembretes de acerto de contas sem desgaste pessoal.

### 2.12. 👤 Portal de Reembolsos de Contas Compartilhadas (Autoatendimento)
* **Status:** Planejado (Roadmap).
* **Descrição:** Link de acesso rápido para amigos e familiares visualizarem o extrato de contas que possuem em comum com o usuário (gastos divididos, parcelas acumuladas), com facilidade de pagar e liquidar o saldo devedor via Pix de forma imediata.

### 2.13. ⚙️ Motor de Ajuste e Descontos de Pontualidade para Reembolsos
* **Status:** Planejado (Roadmap).
* **Descrição:** Permitir configurar abatimentos ou juros amigáveis para acertos de contas tardios ou bonificações em reembolsos antecipados.

### 2.14. 💸 Split Pessoal de Despesas (Viagens e Jantares)
* **Status:** Planejado (Roadmap).
* **Descrição:** Ferramenta integrada para lançamento de despesas coletivas (ex: jantares, viagens em grupo), dividindo automaticamente os custos entre as pessoas cadastradas ("clientes" familiares/amigos) e gerando o saldo devedor/credor de cada um de forma reativa.

### 2.15. 🍿 Painel de Controle de Assinaturas e Custos Fixos Pessoais (Streaming/SaaS)
* **Status:** Planejado (Roadmap).
* **Descrição:** Em vez de métricas corporativas, focar no rastreamento de custos recorrentes pessoais do usuário (Netflix, Spotify, plano de celular, academia). Exibir gráficos de impacto anual desses custos no orçamento, datas de renovação e alertas de reajuste.

### 2.16. 📈 Dashboard Financeiro Híbrido e Inteligente (Pessoal + Reembolsos)
* **Status:** Planejado (Roadmap).
* **Descrição:** Evoluir a tela inicial (Dashboard) do sistema para atuar com inteligência sob o modelo híbrido (pessoal e reembolsos/clientes):
  * **Proatividade e Conexão de Fluxos:** Manter a tela inicial focada em finanças pessoais (Saldo Real, Receitas/Despesas pessoais e Gráficos de categorias), mas incluindo um card dinâmico, discreto e inteligente de **"Reembolsos a Receber"** (ex: *"Você tem R$ 450,00 a receber de amigos/familiares este mês"*). Clicar no card redireciona o usuário para o "Resumo por Clientes". Os cards KPI puramente corporativos (inadimplência, faturamento comercial) continuam isolados na aba interna de Clientes para não poluir o dia a dia.
  * **Segregação de Gráficos:** O gráfico de pizza/rosca de categorias deve separar visualmente o que é gasto pessoal real (custo de vida consumido) do que são valores adiantados de contas divididas com terceiros (valores a reembolsar). Isso evita distorcer a percepção do custo de vida real do usuário.
  * **Projeção de Fluxo de Caixa:** Exibir linha do tempo de saldo previsto para os próximos 30/60 dias integrando os templates de despesas fixas e as datas de reembolso estimadas de amigos/familiares.

### 2.17. 📊 Relatórios Financeiros Pessoais e Familiares (DRE e Caixa vs. Competência)
* **Status:** Planejado (Roadmap).
* **Descrição:** Módulo de relatórios profissionais adaptados para a vida pessoal e familiar:
  * **DRE Pessoal mensalizado:** Comparação mensal de colunas contendo Receitas (salários, investimentos, reembolsos recebidos) -> (-) Despesas Fixas -> (-) Despesas Variáveis -> (=) Margem de Sobra (lucro). Os reembolsos entram como amortização/ajuste de despesa, e não como receita bruta para não inflar a renda líquida real.
  * **Regime de Caixa vs. Regime de Competência:** Exibição clara do impacto de compras parceladas no cartão de crédito. Competência mostra o valor total da compra no mês em que foi realizada (decisão de gasto); Caixa exibe o valor diluído das parcelas à medida que saem da conta bancária mensalmente.
  * **Exportação Premium:** Geração de relatórios limpos em PDF e Excel para fins de arquivo ou planejamento anual.

### 2.18. 📑 Extrato Unificado com Filtros e Badges de Reembolso (UX Padrão Ouro)
* **Status:** Planejado (Roadmap).
* **Descrição:** Aprimorar a listagem de lançamentos diários (extrato geral) para manter a integridade com o extrato bancário real sem perder a clareza visual dos fluxos:
  * **A "Verdade do Banco":** A lista de transações continua exibindo tudo junto por padrão (gastos pessoais e adiantamentos/reembolsos de amigos e familiares), garantindo que o saldo final bata centavo por centavo com a conta corrente real.
  * **Badges Identificadores:** Cada linha de transação na listagem que estiver vinculada a um "cliente" (amigo/familiar) recebe uma tag visual discreta indicando o nome da pessoa (ex: "Pai", "Amigos"), deixando claro quem é o responsável pela liquidação ou reembolso.
  * **Filtros Rápidos no Topo do Extrato:** Adicionar botões de alternância rápidos na barra de busca do extrato: `[Tudo] [Apenas Pessoal] [Apenas Reembolsos]`. Clicar em "Apenas Pessoal" limpa o extrato de adiantamentos/reembolsos temporariamente, permitindo analisar os gastos reais de vida em 1 segundo.

---

## 3. 📈 Recomendações e Tendências de Mercado para o RecebimentoSmart Premium

O mercado de fintechs e sistemas de gestão financeira para PMEs e autônomos está em constante evolução, impulsionado por novas tecnologias e demandas dos usuários. Com base nas tendências de mercado para 2024-2026, as seguintes recomendações são propostas para elevar o RecebimentoSmart a um patamar premium:

### 3.1. Conectividade Bancária e Open Finance
* **A Tendência:** A capacidade de se conectar a múltiplas instituições financeiras e consolidar dados é um pilar do Open Finance. Isso permite uma visão unificada das finanças, conciliação bancária automática e acesso a serviços financeiros personalizados. APIs como Belvo e Pluggy são referências dessa integração no Brasil.
* **Recomendação Prática:** Implementar integrações com provedores de API de Open Finance para permitir que os usuários conectem suas contas bancárias. Isso possibilitaria:
  * **Conciliação Bancária Automática:** Importação e categorização automática de transações bancárias, comparando-as com os registros do sistema.
  * **Visão Consolidada:** Um dashboard que exibe saldos e movimentações de todas as contas conectadas.
  * **Iniciação de Pagamentos:** Permitir a iniciação de pagamentos diretamente do sistema via Open Banking.

### 3.2. Inteligência Artificial (IA) e Automação
* **A Tendência:** A IA está revolucionando a gestão financeira, oferecendo automação de tarefas repetitivas, insights preditivos e personalização. Isso inclui conciliação bancária inteligente, categorização automática de despesas, previsão de fluxo de caixa, detecção de fraudes e assistentes virtuais para suporte.
* **Recomendação Prática:**
  * **Categorização Inteligente de Transações:** Utilizar modelos de IA (como o Gemini Pro já integrado para broadcasts) para sugerir ou categorizar automaticamente despesas e receitas com base no histórico e em padrões.
  * **Previsão de Fluxo de Caixa:** Desenvolver um módulo que utilize dados históricos e pagamentos agendados para projetar o fluxo de caixa futuro, ajudando na tomada de decisões financeiras.
  * **Assistente Virtual:** Um chatbot integrado que responda a perguntas sobre as finanças do usuário ou sugira ações para otimização.

### 3.3. Comunicação Eficazes (WhatsApp Business API)
* **A Tendência:** No Brasil, o WhatsApp é o canal de comunicação dominante. A integração com a WhatsApp Business API para envio de notificações é significativamente mais eficaz do que o e-mail, melhorando a satisfação do cliente e a velocidade de resposta/pagamento.
* **Recomendação Prática:** Integrar completamente a WhatsApp Business API para o envio automatizado de:
  * **Lembretes de Vencimento:** Mensagens personalizadas antes do vencimento da cobrança.
  * **Confirmações de Pagamento:** Notificações instantâneas após o recebimento.
  * **Alertas de Inadimplência:** Comunicação proativa com clientes em atraso.
  * **Suporte ao Cliente:** Canal direto para dúvidas e atendimento.

### 3.4. Gestão de Documentos e Comprovantes
* **A Tendência:** A capacidade de anexar e organizar documentos financeiros (como notas fiscais, contratos, recibos e comprovantes de pagamento) diretamente às transações ou clientes é fundamental para a organização e conformidade fiscal de PMEs e autônomos.
* **Recomendação Prática:**
  * **Upload e Anexo de Documentos:** Permitir que os usuários anexem arquivos (PDFs, imagens) a transações, clientes ou projetos utilizando o Supabase Storage.
  * **Organização e Busca:** Funcionalidades para organizar, indexar e buscar documentos anexados, facilitando auditorias e a conformidade contábil.

### 3.5. Relatórios e Análises Avançadas
* **A Tendência:** Além dos relatórios básicos, sistemas premium oferecem dashboards personalizáveis, DRE (Demonstrativo de Resultado do Exercício) simplificado, fluxo de caixa projetado, análise de rentabilidade por cliente/serviço, e exportação flexível de dados com relatórios agendados.
* **Recomendação Prática:**
  * **Dashboards Personalizáveis:** Capacidade de criar e configurar dashboards com widgets e métricas financeiras customizadas.
  * **Relatórios Financeiros Essenciais:** Geração automática de DRE simplificado, Balanço Patrimonial e relatórios de fluxo de caixa detalhados.
  * **Exportação Profissional:** Layouts estruturados e profissionais para exportação em PDF e Excel.
  * **Agendamento de Relatórios:** Opção de agendar o envio automático de relatórios periódicos por e-mail.

### 3.6. Integração Contábil Simplificada
* **A Tendência:** Facilitar a rotina do contador é um grande diferencial competitivo. A integração com sistemas contábeis populares (como Domínio, Alterdata, Totvs, etc.) ou a capacidade de exportar dados em formatos específicos para importação direta agiliza o fechamento mensal.
* **Recomendação Prática:**
  * **Exportação para Sistemas Contábeis:** Módulos de exportação de dados em formatos compatíveis com os principais softwares contábeis do mercado brasileiro (e.g., OFX, CSV com layouts específicos).
  * **API para Contadores:** Uma API dedicada para que contadores possam extrair dados financeiros autorizados pelos clientes de forma segura e automatizada.

### 3.7. Multi-empresa e Permissões Granulares
* **A Tendência:** PMEs em crescimento e profissionais autônomos que gerenciam múltiplos negócios precisam operar várias empresas sob uma única conta, com controle estrito sobre as permissões de acesso de cada colaborador ou contador.
* **Recomendação Prática:**
  * **Suporte Multi-empresa:** Gestão segregada de múltiplas entidades (CNPJs ou atividades autônomas) a partir do mesmo perfil de usuário.
  * **Gestão de Usuários e Permissões (RBAC):** Sistema robusto de controle de acesso baseado em papéis, permitindo a delegação de permissões de visualização ou edição específicas para cada módulo do sistema.

---

## 4. ✅ Histórico de Tarefas Concluídas

### 4.1. 📱 Menu de Ações (3 Pontinhos) no Cartão de Crédito no Celular
* **Status:** Concluído em Mai/2026.
* **Descrição:** Corrigida a propagação de eventos do clique e touch na div do dropdown da fatura de cartão de crédito, tanto em telas de computadores quanto em dispositivos celulares touch, resolvendo o bug visual onde o menu de ações não se mantinha aberto.

### 4.2. 🔔 Notificação de Erro Duplicada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Validado que a duplicação de Toasters nas páginas internas foi inteiramente resolvida em limpezas de refatoração, mantendo Toasters isolados apenas em telas externas públicas e layouts centrais.

### 4.3. 🚀 Rota `/cadastro` Não Encontrada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Resolvido o erro de race condition do roteador adicionando redirecionamento seguro da rota de cadastro de usuário já autenticado direto para a listagem financeira no App.tsx.

### 4.4. 👤 Remoção de CPF/CNPJ de Cadastros e Perfis
* **Status:** Concluído em Mai/2026.
* **Descrição:** Removido o campo `cpf_cnpj` do banco de dados (tabela `profiles`), triggers, formulários de cadastro legado e V2, e configurado fallback fictício para a API do Pagar.me a fim de manter integrações de PIX em funcionamento silencioso.

### 4.5. 📊 Melhorias na Tela de Lançamentos (UI/UX)
* **Status:** Concluído em Abr/2026.
* **Descrição:** Cores de valores previstos suaves (verde para positivo, vermelho para negativo), filtros fixos (sticky) no desktop e layout compactado lado a lado das buscas, filtros de mês e resumo em telas reduzidas.

### 4.6. 🔗 Integração de Webhooks
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.

### 4.7. 👑 Aprimoramento da Impersonação
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.

### 4.8. 💳 Migração de Gateway de Pagamento
* **Status:** Concluído em Mar/2026.
* **Descrição:** Substituição do Mercado Pago pela API do Banco Inter PJ concluída com sucesso.

### 4.9. 💳 Cálculo Proporcional (Pró-rata) para Upgrade de Planos
* **Status:** Concluído em Mai/2026.
* **Descrição:** Implementação de cálculo dinâmico e reativo de pró-rata de assinatura quando usuários de planos ativos (ex: Básico) realizam upgrade para planos superiores (ex: Pró). O valor é calculado proporcionalmente aos dias restantes no ciclo mensal do usuário, abatendo créditos de indicação e atualizando a cobrança Pix do Banco Inter PJ de forma 100% dinâmica. Inclui banner informativo premium de total transparência financeira no checkout de assinaturas.

### 4.10. 📧 Tela de Envio de E-mails em Massa (Admin)
* **Status:** Concluído em Mai/2026.
* **Descrição:** Criada a página administrativa `AdminBroadcastV2.tsx` de alto nível para compor e realizar envios de e-mails em lote para toda a base de usuários ativos. A tela possui suporte nativo a tags HTML para estilização, inclusão de imagens coladas com upload direto ao Storage do Supabase, inserção de emojis e integração inteligente com o modelo Gemini Pro (API da Google) para otimização profissional de conteúdo.

### 4.11. 📱 Otimização do Layout de Linha Fina no Mobile
* **Status:** Concluído em Jun/2026.
* **Descrição:** O padding vertical das linhas no celular agora se ajusta dinamicamente baseando-se no `rowDensity` (reduzindo-se para `py-1` no modo compacto). Além disso, a coluna de previsto acumulado e os metadados secundários (conta, categoria, cliente) são estritamente ocultados nas listagens mobile de faturas e transações comuns quando o espaçamento Fino está ativo, garantindo visualização em linha única limpa.

### 4.12. 💬 Saldo Previsto no Modal de Detalhes
* **Status:** Concluído em Jun/2026.
* **Descrição:** Adicionada a exibição do saldo previsto pós-lançamento (`runningBalance`) no modal de detalhes (`TransactionSummaryModal`), disponível de forma idêntica tanto para celular quanto para computadores de mesa.

### 4.13. ⚙️ Autosave das Preferências do Usuário
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementação de salvamento automático (autosave) em tempo real de todas as preferências visuais e de layout (tema, densidade, predictedLayout, etc.) no Supabase e LocalStorage. O nome completo do usuário também é salvo automaticamente via evento `onBlur`. Como consequência, a barra de ações manual (botões "Salvar" e "Descartar") foi inteiramente removida da interface do formulário de configurações.

### 4.14. 🎙️ Assistente Financeiro por Voz (Artie - Fase 1)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementação do assistente inteligente de voz do sistema (Artie). O usuário pode interagir por comandos falados para:
  * Criar lançamentos comuns, parcelados (ex: 10x) ou recorrentes (ex: mensal, anual) de forma dinâmica.
  * Confirmar/dar baixa em lançamentos pendentes com match aproximado de valor, descrição e data.
  * Excluir lançamentos existentes citando o nome, valor ou data.
  * Alterar campos (valor, descrição, data, conta, categoria) de lançamentos existentes de forma silenciosa (ex: *"altere o valor do almoço de hoje para 15 reais"*).
  * Execução silenciosa automática (sem abrir a mini modal) quando houver correspondência exata e sem ambiguidades no banco, reduzindo o atrito do usuário.
  * Interface premium de **Sucesso Silencioso** com barra de progresso linear, temporizador de 5 segundos, e botões de **Desfazer (Rollback)** e **Editar Lançamento**.
  * Guia de comandos falados completo exibido na mini modal de gravação de áudio com exemplos para cada ação.

### 4.15. 📊 Padronização do Saldo Previsto com Preferências do Usuário (UI/UX)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Padronizada a exibição do saldo previsto dinâmico para respeitar as preferências do usuário (`predictedLayout` e `rowDensity`). O estilo visual foi otimizado para usar fontes normais (sem negrito) e cores suaves customizadas (`text-previsto-positivo` em verde suave e `text-previsto-negativo` em vermelho suave), distinguindo-o claramente do valor do lançamento individual.

### 4.16. 💸 Edição de Tipo de Lançamento (Receita x Despesa)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Adicionado suporte à edição direta do tipo de lançamento (Despesa, Receita ou Transferência) na própria tela/modal de detalhes (`FinancialTransactionModalV2.tsx`) sem precisar apagar e recriar o lançamento do zero.

### 4.17. ➕ Menu Suspenso no Botão de Criar Lançamento (UI/UX)
* **Status:** Concluído em Jun/2026.
* **Descrição:** Implementado menu suspenso de hover (hover dropdown) no botão principal "Criar Lançamento" na listagem de transações. Por padrão, clicar no botão abre o modal configurado para **Despesa**, e ao passar o mouse ele exibe atalhos rápidos com marcadores visuais para criar **🟢 Receita** ou **🔵 Transferência**.

### 4.18. 💳 Correção de Comportamento no Menu do Cartão de Crédito
* **Status:** Concluído em Jul/2026.
* **Descrição:** Corrigido o bug na tela de cartão de crédito onde clicar no menu de ações (3 pontinhos) de um lançamento executava um scroll indesejado para o topo e não mantinha o menu suspenso aberto.


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

## 3. 📈 Tendências de Mercado para Sistemas Financeiros Premium (2024-2026)

O mercado de fintechs e sistemas de gestão financeira para PMEs e autônomos está em constante evolução, impulsionado por novas tecnologias e demandas dos usuários. As seguintes tendências e funcionalidades são cruciais para um sistema ser considerado premium:

### 3.1. Open Finance e Conectividade Bancária
A capacidade de se conectar a múltiplas instituições financeiras e consolidar dados é um pilar do Open Finance. Isso permite uma visão unificada das finanças, conciliação bancária automática e acesso a serviços financeiros personalizados. APIs como Belvo e Pluggy são exemplos de soluções que facilitam essa integração no Brasil.

### 3.2. Inteligência Artificial (IA) e Automação
A IA está revolucionando a gestão financeira, oferecendo automação de tarefas repetitivas, insights preditivos e personalização. Isso inclui conciliação bancária inteligente, categorização automática de despesas, previsão de fluxo de caixa, detecção de fraudes e assistentes virtuais para suporte.

### 3.3. Canais de Comunicação Eficazes (WhatsApp Business API)
No Brasil, o WhatsApp é um canal de comunicação dominante. A integração com a WhatsApp Business API para envio de notificações de cobrança, lembretes de vencimento, confirmações de pagamento e suporte ao cliente é significativamente mais eficaz do que o e-mail, melhorando as taxas de recebimento e a satisfação do cliente.

### 3.4. Gestão de Documentos e Comprovantes
A capacidade de anexar e organizar documentos financeiros, como notas fiscais, contratos, recibos e comprovantes de pagamento, diretamente às transações ou clientes, é fundamental para a organização e conformidade fiscal. Isso geralmente envolve integração com serviços de armazenamento em nuvem.

### 3.5. Relatórios e Análises Avançadas
Além dos relatórios básicos, sistemas premium oferecem dashboards personalizáveis, DRE (Demonstrativo de Resultado do Exercício) simplificado, fluxo de caixa projetado, análise de rentabilidade por cliente/serviço, e exportação flexível em formatos como PDF, Excel e CSV, com opções de agendamento de relatórios.

### 3.6. Integração Contábil
Facilitar a vida do contador é um grande diferencial. A integração com sistemas contábeis populares (como Domínio, Alterdata, Totvs, etc.) ou a capacidade de exportar dados em formatos específicos para importação direta agiliza o fechamento contábil e reduz erros.

### 3.7. Multi-empresa/Multi-usuário e Permissões Granulares
Para PMEs que crescem ou autônomos que gerenciam múltiplos negócios, a capacidade de gerenciar várias empresas sob uma única conta, com permissões de acesso granulares para diferentes usuários (funcionários, sócios, contadores), é essencial para segurança e organização.

---

## 4. 💎 Recomendações para Tornar o RecebimentoSmart Premium

Com base na análise do sistema atual e nas tendências de mercado, as seguintes recomendações são propostas para elevar o RecebimentoSmart a um patamar premium:

### 4.1. Conectividade Bancária e Open Finance
* **Integração com APIs de Open Finance:** Implementar integrações com provedores de API de Open Finance (e.g., Belvo, Pluggy) para permitir que os usuários conectem suas contas bancárias. Isso possibilitaria:
  * **Conciliação Bancária Automática:** Importação e categorização automática de transações bancárias, comparando-as com os registros do sistema.
  * **Visão Consolidada:** Um dashboard que exibe saldos e movimentações de todas as contas conectadas.
  * **Iniciação de Pagamentos:** No futuro, permitir a iniciação de pagamentos diretamente do sistema via Open Banking.

### 4.2. Inteligência Artificial para Automação e Insights
* **Categorização Inteligente de Transações:** Utilizar modelos de IA (como o Gemini Pro já integrado para broadcasts) para sugerir ou categorizar automaticamente despesas e receitas com base em histórico e padrões.
* **Previsão de Fluxo de Caixa:** Desenvolver um módulo que utilize dados históricos e pagamentos agendados para projetar o fluxo de caixa futuro, ajudando na tomada de decisões financeiras.
* **Assistente Virtual:** Um chatbot integrado que responda a perguntas sobre as finanças do usuário ou sugira ações para otimização.

### 4.3. Notificações e Comunicação via WhatsApp Business API
* **Integração Completa com WhatsApp Business API:** Além do compartilhamento de links, implementar o envio automatizado de:
  * **Lembretes de Vencimento:** Mensagens personalizadas antes do vencimento.
  * **Confirmações de Pagamento:** Notificações instantâneas após o recebimento.
  * **Alertas de Inadimplência:** Comunicação proativa com clientes em atraso.
  * **Suporte ao Cliente:** Canal direto para dúvidas e atendimento.

### 4.4. Gestão de Documentos e Comprovantes
* **Upload e Anexo de Documentos:** Permitir que os usuários anexem arquivos (PDFs, imagens) a transações, clientes ou projetos. Isso pode ser feito utilizando o Supabase Storage, que já é parte da stack.
* **Organização e Busca:** Funcionalidades para organizar e buscar documentos anexados, facilitando a auditoria e a conformidade.

### 4.5. Relatórios e Análises Avançadas
* **Dashboards Personalizáveis:** Oferecer a capacidade de criar e personalizar dashboards com diferentes widgets e métricas financeiras.
* **Relatórios Financeiros Essenciais:** Gerar automaticamente DRE simplificado, Balanço Patrimonial (para PMEs), e relatórios de fluxo de caixa detalhados.
* **Exportação Profissional:** Melhorar as opções de exportação para PDF e Excel, com layouts profissionais e dados estruturados para análise.
* **Agendamento de Relatórios:** Permitir que os usuários agendem o envio automático de relatórios por e-mail.

### 4.6. Integração Contábil Simplificada
* **Exportação para Sistemas Contábeis:** Desenvolver módulos de exportação de dados em formatos compatíveis com os principais softwares contábeis utilizados no Brasil (e.g., OFX, CSV com layout específico).
* **API para Contadores:** Criar uma API dedicada para que contadores possam acessar os dados financeiros de seus clientes de forma segura e automatizada (com consentimento do cliente).

### 4.7. Multi-empresa e Permissões Granulares
* **Suporte Multi-empresa:** Permitir que um único usuário gerencie as finanças de múltiplas entidades (CNPJs ou atividades autônomas) de forma segregada.
* **Gestão de Usuários e Permissões:** Implementar um sistema robusto de controle de acesso baseado em papéis (RBAC), permitindo que o administrador conceda permissões específicas a outros usuários (ex: acesso apenas a relatórios, acesso total a um cliente específico, etc.).

---

## 5. ✅ Histórico de Tarefas Concluídas

### 5.1. 📱 Menu de Ações (3 Pontinhos) no Cartão de Crédito no Celular
* **Status:** Concluído em Mai/2026.
* **Descrição:** Corrigida a propagação de eventos do clique e touch na div do dropdown da fatura de cartão de crédito, tanto em telas de computadores quanto em dispositivos celulares touch, resolvendo o bug visual onde o menu de ações não se mantinha aberto.

### 5.2. 🔔 Notificação de Erro Duplicada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Validado que a duplicação de Toasters nas páginas internas foi inteiramente resolvida em limpezas de refatoração, mantendo Toasters isolados apenas em telas externas públicas e layouts centrais.

### 5.3. 🚀 Rota `/cadastro` Não Encontrada
* **Status:** Concluído em Mai/2026.
* **Descrição:** Resolvido o erro de race condition do roteador adicionando redirecionamento seguro da rota de cadastro de usuário já autenticado direto para a listagem financeira no App.tsx.

### 5.4. 👤 Remoção de CPF/CNPJ de Cadastros e Perfis
* **Status:** Concluído em Mai/2026.
* **Descrição:** Removido o campo `cpf_cnpj` do banco de dados (tabela `profiles`), triggers, formulários de cadastro legado e V2, e configurado fallback fictício para a API do Pagar.me a fim de manter integrações de PIX em funcionamento silencioso.

### 5.5. 📊 Melhorias na Tela de Lançamentos (UI/UX)
* **Status:** Concluído em Abr/2026.
* **Descrição:** Cores de valores previstos suaves (verde para positivo, vermelho para negativo), filtros fixos (sticky) no desktop e layout compactado lado a lado das buscas, filtros de mês e resumo em telas reduzidas.

### 5.6. 🔗 Integração de Webhooks
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de status de pagamento do cliente no backend. Inserção correta na tabela `subscriptions` validada.

### 5.7. 👑 Aprimoramento da Impersonação
* **Status:** Concluído em Mar/2026.
* **Descrição:** Corrigida a lógica de impersonação do Administrador no `AuthContext.tsx` para forçar a atualização completa do estado reativo.

### 5.8. 💳 Migração de Gateway de Pagamento
* **Status:** Concluído em Mar/2026.
* **Descrição:** Substituição do Mercado Pago pelo Stripe concluída com sucesso.

### 5.9. 💳 Cálculo Proporcional (Pró-rata) para Upgrade de Planos
* **Status:** Concluído em Mai/2026.
* **Descrição:** Implementação de cálculo dinâmico e reativo de pró-rata de assinatura quando usuários de planos ativos (ex: Básico) realizam upgrade para planos superiores (ex: Pró). O valor é calculado proporcionalmente aos dias restantes no ciclo mensal do usuário, abatendo créditos de indicação e atualizando a cobrança Pix do Banco Inter PJ de forma 100% dinâmica. Inclui banner informativo premium de total transparência financeira no checkout de assinaturas.

### 5.10. 📧 Tela de Envio de E-mails em Massa (Admin)
* **Status:** Concluído em Mai/2026.
* **Descrição:** Criada a página administrativa `AdminBroadcastV2.tsx` de alto nível para compor e realizar envios de e-mails em lote para toda a base de usuários ativos. A tela possui suporte nativo a tags HTML para estilização, inclusão de imagens coladas com upload direto ao Storage do Supabase, inserção de emojis e integração inteligente com o modelo Gemini Pro (API da Google) para otimização profissional de conteúdo.

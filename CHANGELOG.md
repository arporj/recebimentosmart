# Changelog

Todo o registro de alterações notáveis do projeto **Recebimento $mart** será documentado neste arquivo.

O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto adota o [Versionamento Semântico](https://semver.org/spec/v2.0.0.html).

---

## [2.4.0] - 2026-07-02

### Adicionado
- **Campos Personalizados no Cadastro de Clientes**: Inclusão de suporte nativo a campos personalizados (custom fields) diretamente no Step 1 do modal de criação `NewClientWithTransactionModal.tsx`.
- **Regra de Auditoria de Telas Financeiras**: Adicionada regra rigorosa de verificação cruzada (Regra 14 no GEMINI.md) obrigando auditoria de todas as telas que consomem dados financeiros a cada modificação em lançamentos.

### Modificado
- **Responsividade na Gestão de Clientes**: Substituição da tabela rígida por uma estrutura híbrida no mobile: KPIs com truncamento flexível contra overflow e listagem de clientes exibida em cards compactos empilhados com botões táteis.

### Corrigido
- **Filtro de Templates Recorrentes**: Correção da exibição indevida de templates recorrentes ("mãe") nas queries principais de faturamento e saldo em `DashboardV2.tsx`, `CreditCardV2.tsx` e `RecurrenceV2.tsx` (agora filtrando `is_template = false`).
- **Lançamentos Antigos no Mês Atual**: Correção do bug na função `allInstancesUpToMonth` que movia transações não pagas de meses anteriores para a data de hoje.
- **Remoção de Templates Fantasmas**: Criação de migração de banco para deletar templates órfãos com valor R$ 0,00 e sem filhos físicos que geravam exibições virtuais infinitas.
- **Legibilidade no Modo Dark**: Suporte completo a cores escuras (`dark:bg-slate-900`, `dark:text-slate-100`, etc.) no componente `ModalOpcaoRecorrente.tsx`.

## [2.3.0] - 2026-07-01

### Adicionado
- **Gráficos de Categorias na Visão Geral**: Integração de dois novos gráficos (Despesas por Categoria e Receitas por Categoria) na aba "Visão Geral" do Dashboard, incluindo listagem analítica com valores e percentuais logo abaixo do gráfico e ocultação inteligente de rótulos internos para fatias de pizza pequenas.
- **Controles Interativos de Exibição**: Controles individuais nos cabeçalhos dos gráficos para alternar em tempo real entre visualização em Pizza ou Barra e aplicar filtro de apenas lançamentos confirmados (ocultando lançamentos com status *pending*).
- **Consistência de Temas Visuais**: Adaptação automática e em tempo real do fundo e das cores dos textos dos gráficos conforme o tema global selecionado (Claro, Original, Escuro).

### Corrigido
- **Cálculo Consistente do Saldo Acumulado (Evolução)**: Integração da engine de faturas de cartão de crédito no Dashboard, deduzindo faturas passadas e futuras de cartões vinculados a contas correntes.
- **Correção de Saldo de Abertura Inicial**: Correção da distorção visual de saldo inicial alto em Julho (`R$ 4.997,33`), permitindo que transferências físicas passadas que liquidaram faturas em Junho reduzam corretamente a abertura histórica do mês seguinte.
- **Consolidação de Lançamentos Atrasados**: Implementação da regra de empurrão visual de transações pendentes e atrasadas do passado para hoje (`todayStr`) no gráfico, sincronizando o saldo acumulado centavo por centavo com a listagem de transações.

## [2.2.0] - 2026-06-30

### Adicionado
- **Módulo de Novidades In-App (Fase B)**: Integração de gaveta deslizante animada (slide-over) com suporte a renderização de Markdown regex leve, categorização colorida e badge reativo no painel de controle do usuário.
- **Marcação Automática de Leitura**: Sistema otimizado de persistência de confirmação de leitura em lote por usuário no banco de dados para eliminar badges de novidades repetidos.
- **Painel de Gestão Administrativa (`AdminChangelogV2`)**: Nova tela para administradores cadastrarem, editarem e removerem novidades e atualizações com área de pré-visualização reativa e integração direta com disparos de e-mail de Broadcast.

### Corrigido
- **Transações Silenciosas sem Conta**: Correção no carregamento e filtragem de lançamentos que não possuíam conta cadastrada (ex: criadas silenciosamente por comandos de voz do Artie). Agora, essas transações são associadas a uma conta virtual "Sem Conta" no frontend, permitindo que apareçam na listagem financeira normal para que o usuário possa identificá-las e associar uma conta real de forma simples.
- **Campos e Ícones de Cartão de Crédito no Modal de Edição Rápida**: Correção da renderização e validações dos campos condicionais de cartão de crédito ("Fatura de" e "Titular") no modal de edição rápida (`QuickEditTransactionModal.tsx`), que antes ficavam ocultos ao selecionar um cartão como "Inter Crédito".
- **Logotipos e Ícones de Bancos Consistentes**: Atualização dos componentes de ícones de conta (`AccountIcon`) no modal rápido e no modal completo para renderizar os favicons e cores reais das instituições bancárias de forma dinâmica e automatizada, inclusive inferindo o logotipo com base no nome do cartão/conta para registros cujos metadados de banco sejam nulos.

---

## [2.1.0] - 2026-06-29

### Adicionado
- **Assistente Financeiro por Voz (Artie - Fase 1) [Premium]**: Interface conversacional inteligente que permite realizar comandos de voz em tempo real. Os usuários podem cadastrar transações (comuns, recorrentes e parceladas), dar baixa em lançamentos e efetuar exclusões e edições contextuais por voz. Conta com painel de rollback (desfazer) de 5 segundos e guia de comandos por áudio.
- **Menu Suspenso no Botão de Lançamento**: Hover dropdown no botão principal "Criar Lançamento", permitindo a criação rápida de receitas e transferências sem a necessidade de alternar manualmente após abrir a tela de despesa.
- **Edição Direta do Tipo de Lançamento**: Capacidade de alternar o tipo da transação (Receita, Despesa ou Transferência) na modal de edição, sem precisar apagar e reinserir os dados do lançamento.

### Modificado
- **Autosave de Preferências**: O sistema agora salva automaticamente em tempo real as preferências visuais de tema, densidade de linhas e modo do saldo previsto no banco de dados e LocalStorage ao sair dos campos, eliminando botões manuais de salvar ou descartar.
- **Layout Compacto Mobile**: Ocultação automática de metadados secundários (categoria, conta, cliente) e redução agressiva de paddings para listagens financeiras em modo fino no celular, otimizando o aproveitamento vertical de tela.
- **Padronização Visual do Saldo Previsto**: Cores de saldo previsto ajustadas para verde e vermelho suaves de acordo com a preferência de layout do usuário, utilizando fontes mais finas para distinguir o saldo acumulado dos lançamentos unitários.

### Corrigido
- **Saldo Previsto na Modal de Detalhes**: Correção no cálculo e renderização consistente do `runningBalance` dentro do modal de resumo de transações tanto no desktop quanto no celular.

---

## [2.0.0] - 2026-05-28

### Adicionado
- **Painel Administrativo de Broadcast (`AdminBroadcastV2`)**: Nova tela premium de e-mails em massa com suporte a formatação HTML, imagens com upload direto ao Storage do Supabase e otimização de conteúdo integrado com a API do Gemini Pro (Google).
- **Cálculo Proporcional de Assinaturas (Pró-rata)**: Sistema de upgrade de planos reativo que calcula a proporção exata de dias restantes da mensalidade, abatendo créditos de indicações passadas e gerando uma fatura PIX proporcional no checkout com total transparência.

### Modificado
- **Substituição de Gateway de Pagamento**: Desativação e remoção integral do Mercado Pago, migrando toda a infraestrutura de assinaturas e faturamento de cobranças Pix para a API do Banco Inter PJ.
- **Remoção de CPF/CNPJ**: Exclusão definitiva do campo `cpf_cnpj` dos perfis e formulários do banco de dados, configurando o envio de dados fake à API do faturamento para manter compatibilidade e conformidade legal com regras de privacidade.

### Corrigido
- **Ações de Lançamentos no Celular**: Correção no evento de propagação do dropdown de 3 pontinhos nas linhas de cartão de crédito no celular, solucionando o bug de rolagem ao topo da página e fechamento acidental.
- **Toasters Duplicados**: Correção de race conditions de instanciamento do Toaster nas páginas internas, evitando exibição repetida de avisos.
- **Segurança no Cadastro**: Correção no fluxo de autenticação e redirecionamento da rota `/cadastro` para evitar que usuários logados caiam em loops de tela.

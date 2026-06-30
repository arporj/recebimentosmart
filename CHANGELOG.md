# Changelog

Todo o registro de alterações notáveis do projeto **Recebimento $mart** será documentado neste arquivo.

O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto adota o [Versionamento Semântico](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - 2026-06-30

### Adicionado
- **Módulo de Novidades In-App (Fase B)**: Integração de gaveta deslizante animada (slide-over) com suporte a renderização de Markdown regex leve, categorização colorida e badge reativo no painel de controle do usuário.
- **Marcação Automática de Leitura**: Sistema otimizado de persistência de confirmação de leitura em lote por usuário no banco de dados para eliminar badges de novidades repetidos.
- **Painel de Gestão Administrativa (`AdminChangelogV2`)**: Nova tela para administradores cadastrarem, editarem e removerem novidades e atualizações com área de pré-visualização reativa e integração direta com disparos de e-mail de Broadcast.

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

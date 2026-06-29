-- Criar tabela de changelogs
CREATE TABLE IF NOT EXISTS public.changelogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) CHECK (category IN ('feature', 'bugfix', 'improvement')) NOT NULL,
    published_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Criar tabela de leituras de changelogs por usuário
CREATE TABLE IF NOT EXISTS public.user_changelog_reads (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    changelog_id UUID REFERENCES public.changelogs(id) ON DELETE CASCADE NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, changelog_id)
);

-- Habilitar RLS
ALTER TABLE public.changelogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_changelog_reads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para changelogs
DROP POLICY IF EXISTS "Permitir leitura para todos os usuários autenticados" ON public.changelogs;
CREATE POLICY "Permitir leitura para todos os usuários autenticados" 
ON public.changelogs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Apenas administradores podem modificar changelogs" ON public.changelogs;
CREATE POLICY "Apenas administradores podem modificar changelogs" 
ON public.changelogs FOR ALL TO authenticated 
USING (public.is_admin(auth.uid())) 
WITH CHECK (public.is_admin(auth.uid()));

-- Políticas de RLS para user_changelog_reads
DROP POLICY IF EXISTS "Usuários podem ler suas próprias marcações de leitura" ON public.user_changelog_reads;
CREATE POLICY "Usuários podem ler suas próprias marcações de leitura" 
ON public.user_changelog_reads FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas próprias marcações de leitura" ON public.user_changelog_reads;
CREATE POLICY "Usuários podem criar suas próprias marcações de leitura" 
ON public.user_changelog_reads FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias marcações de leitura" ON public.user_changelog_reads;
CREATE POLICY "Usuários podem deletar suas próprias marcações de leitura" 
ON public.user_changelog_reads FOR DELETE TO authenticated 
USING (auth.uid() = user_id);

-- Inserir dados iniciais históricos correspondentes ao CHANGELOG.md se não existirem
INSERT INTO public.changelogs (version, title, category, description, published_at)
SELECT 'v2.0.0', 'Lançamento da Identidade V2 e Novo Gateway Inter PJ', 'feature', '### Added
- **Painel Administrativo de Broadcast (`AdminBroadcastV2`)**: Nova tela premium de e-mails em massa com suporte a formatação HTML, imagens com upload direto ao Storage do Supabase e otimização de conteúdo integrado com a API do Gemini Pro (Google).
- **Cálculo Proporcional de Assinaturas (Pró-rata)**: Sistema de upgrade de planos reativo que calcula a proporção exata de dias restantes da mensalidade, abatendo créditos de indicações passadas e gerando uma fatura PIX proporcional no checkout com total transparência.

### Changed
- **Substituição de Gateway de Pagamento**: Desativação e remoção integral do Mercado Pago, migrando toda a infraestrutura de assinaturas e faturamento de cobranças Pix para a API do Banco Inter PJ.
- **Remoção de CPF/CNPJ**: Exclusão definitiva do campo `cpf_cnpj` dos perfis e formulários do banco de dados, configurando o envio de dados fake à API do faturamento para manter compatibilidade e conformidade legal com regras de privacidade.

### Fixed
- **Ações de Lançamentos no Celular**: Correção no evento de propagação do dropdown de 3 pontinhos nas linhas de cartão de crédito no celular, solucionando o bug de rolagem ao topo da página e fechamento acidental.
- **Toasters Duplicados**: Correção de race conditions de instanciamento do Toaster nas páginas internas, evitando exibição repetida de avisos.
- **Segurança no Cadastro**: Correção no fluxo de autenticação e redirecionamento da rota `/cadastro` para evitar que usuários logados caiam em loops de tela.', '2026-05-28 12:00:00-03'
WHERE NOT EXISTS (SELECT 1 FROM public.changelogs WHERE version = 'v2.0.0');

INSERT INTO public.changelogs (version, title, category, description, published_at)
SELECT 'v2.1.0', 'Apresentando o Artie por Voz e Melhorias de Layout', 'feature', '### Added
- **Assistente Financeiro por Voz (Artie - Fase 1) [Premium]**: Interface conversacional inteligente que permite realizar comandos de voz em tempo real. Os usuários podem cadastrar transações (comuns, recorrentes e parceladas), dar baixa em lançamentos e efetuar exclusões e edições contextuais por voz. Conta com painel de rollback (desfazer) de 5 segundos e guia de comandos por áudio.
- **Menu Suspenso no Botão de Lançamento**: Hover dropdown no botão principal "Criar Lançamento", permitindo a criação rápida de receitas e transferências sem a necessidade de alternar manualmente após abrir a tela de despesa.
- **Edição Direta do Tipo de Lançamento**: Capacidade de alternar o tipo da transação (Receita, Despesa ou Transferência) na modal de edição, sem precisar apagar e reinserir os dados do lançamento.

### Changed
- **Autosave de Preferências**: O sistema agora salva automaticamente em tempo real as preferências visuais de tema, densidade de linhas e modo do saldo previsto no banco de dados e LocalStorage ao sair dos campos, eliminando botões manuais de salvar ou descartar.
- **Layout Compacto Mobile**: Ocultação automática de metadados secundários (categoria, conta, cliente) e redução agressiva de paddings para listagens financeiras em modo fino no celular, otimizando o aproveitamento vertical de tela.
- **Padronização Visual do Saldo Previsto**: Cores de saldo previsto ajustadas para verde e vermelho suaves de acordo com a preferência de layout do usuário, utilizando fontes mais finas para distinguir o saldo acumulado dos lançamentos unitários.

### Fixed
- **Saldo Previsto na Modal de Detalhes**: Correção no cálculo e renderização consistente do `runningBalance` dentro do modal de resumo de transações tanto no desktop quanto no celular.', '2026-06-29 11:00:00-03'
WHERE NOT EXISTS (SELECT 1 FROM public.changelogs WHERE version = 'v2.1.0');

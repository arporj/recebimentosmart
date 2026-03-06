-- Adiciona coluna para soft delete (exclusão lógica)
ALTER TABLE public.clients
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Atualiza as políticas de RLS para ignorar clientes deletados por padrão na leitura (se quisermos que sumam da lista)
-- Observação: Para garantir que os relatórios mantenham a integridade, poderíamos apenas filtrar `deleted_at IS NULL` no frontend,
-- ou ajustar as policies. Aqui vamos adotar a abordagem de que o RLS continua permitindo acesso (para histórico),
-- mas a listagem principal no app vai filtrar os que têm `deleted_at` nulo.

-- Criamos um index para otimizar queries buscando clientes ativos/inativos (opcional)
CREATE INDEX idx_clients_deleted_at ON public.clients(deleted_at);

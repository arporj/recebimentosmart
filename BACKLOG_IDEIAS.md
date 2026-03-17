# Ideias e Funcionalidades Pendentes (Backlog)

Este documento guarda ideias e funcionalidades que foram removidas ou adiadas durante a migração V2, mas que podem ser úteis no futuro.

## Chat de Suporte Administrativo
**Status:** Removido em Mar/2026.
**Motivo:** Usuário optou por não implementar no momento da migração V2 para simplificar o sistema, guardando a ideia para uma possível implementação futura.

### Contexto Anterior (V1)
- Existia uma página `src/pages/AdminChat.tsx` que gerenciava as conversas.
- O mapeamento ocorria na rota `/admin/chat` (acesso restrito de admin).
- Tecnologias e integração envolviam o Supabase para armazenamento das conversas ("feedback" expandido ou tabelas "chats"/"messages"). 
- A ideia original envolvia os administradores responderem em tempo real a dúvidas de suporte iniciadas por clientes.

> **Quando reavivado:** Criar nova página com prefixo V2 (`AdminChatPageV2.tsx`) seguindo os padrões do Stitch (`rounded-2xl`, chats em bolha, listagem lateral de canais). Inspirar-se no componente de comentários do `FeedbackDetailsV2.tsx`.

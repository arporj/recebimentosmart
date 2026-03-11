# Status da Migração para V2 (Recebimento Smart)

Este documento acompanha o progresso da reescrita e atualização das interfaces do sistema para a nova identidade visual (V2), baseada nos padrões do Stitch.

## Páginas Públicas e Autenticação
- [x] Landing Page (`/v2` - StitchLanding)
- [x] Login (`/v2/login`)
- [x] Cadastro (`/v2/cadastro`)
- [x] Recuperação de Senha (`/v2/forgot-password`)
- [x] Redefinição de Senha (`/v2/reset-password`)

## Área do Cliente (Dashboard)
- [x] Clientes / Dashboard principal (`/v2/clientes`)
- [x] Mensalidades / Pagamentos (`/v2/pagamentos`)
- [x] Relatórios (`/v2/relatorios`)
- [x] Meus Feedbacks (`/v2/feedbacks`)
- [x] Campos Personalizados (`/v2/campos-personalizados`)

## Páginas Pendentes da Área do Cliente
- [x] **Perfil e Configurações da Conta** (`/profile` -> `UserProfileSettings`)
- [x] **Indique e Ganhe** (`/indicacoes` -> `ReferralPageV2`)
- [ ] **Planos e Assinatura** (`/payment` -> `SubscriptionPage`)
- [ ] **Status de Pagamento - Sucesso** (`/payment-success`)
- [ ] **Status de Pagamento - Falha** (`/payment-failure`)

## Páginas do Painel Administrativo (Pendentes)
- [ ] **Gerenciamento de Usuários** (`/admin/users`)
- [ ] **Visualização de Feedbacks** (`/admin/feedbacks`)
- [ ] **Chat de Suporte Admin** (`/admin/chat`)
- [ ] **Configurações Globais do Sistema** (`/configuracoes`)

## Não esquecer 
- [ ] **Validar se o sistema v2 está compatível com aparelhos menores (celular e tablet - responsividade)**
---
*Para atualizar, basta marcar os checkboxes com "x" conforme as telas forem sendo criadas no MCP do Stitch e integradas ao `App.tsx`.*

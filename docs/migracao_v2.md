# 🚀 Guia de Migração: Recebimento Smart V2.0

Este documento serve como um mapa técnico e checklist de progresso para a reescrita estrutural das interfaces originais (V1) para os novos padrões e designs da versão 2.0 (V2).

---

## 🏁 Checklist de Páginas e Status da Migração

| Funcionalidade / Tela | Antigo Componente (V1) | Novo Componente (V2) | Rota Designada | Status da Migração |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard Principal** | `Dashboard.tsx` | `DashboardV2.tsx` | `/dashboard` | ✅ **Concluído** |
| **Cadastro de Clientes** | `Clients.tsx` | `ClientsV2.tsx` | `/clientes` | ✅ **Concluído** |
| **Faturamento Mensal** | `Billing.tsx` | `BillingPageV2.tsx` | `/faturamento` | ✅ **Concluído** |
| **Plano & Assinatura** | `Subscription.tsx` | `SubscriptionPageV2.tsx` | `/assinatura` | ✅ **Concluído** |
| **Área Administrativa** | `AdminPanel.tsx` | `AdminPanelV2.tsx` | `/admin` | ✅ **Concluído** |
| **Controle de Feedback** | `FeedbackDetails.tsx` | `FeedbackDetailsV2.tsx` | `/admin/feedbacks` | ✅ **Concluído** |
| **Gestão Financeira** | — *(Novo Módulo)* | `FinancePageV2.tsx` | `/financeiro` | ✅ **Concluído** |

---

## 🚧 Checklist Técnico de Refatoração (Geral)

* [ ] **Remoção da Instância Duplicada do Toast:**
  * Identificado que `SubscriptionPageV2.tsx` possui um `<Toaster />` secundário, gerando o bug de notificações redundantes.
  * Apenas o `<Toaster />` do `App.tsx` global deve ser mantido.
* [x] **Refatoração da Página de Login:**
  * Migrada integralmente para padrões modernos de UI, removendo componentes redundantes.
* [x] **Validações Responsivas:**
  * Validado o colapso do Menu Lateral (Sidebar) em dispositivos móveis.
  * Garante-se espaçamento mínimo seguro (`pb-24` ou similar) em listas longas visualizadas via celular para não serem cobertas pela barra de navegação inferior se aplicável.

---

## 🛠️ Regras Fundamentais para Novas Telas V2

Ao codificar ou corrigir elementos deste projeto, siga rigorosamente estes 4 pilares técnicos:

1. **Imports Padronizados:** Utilize sempre o arquivo central `@/lib/supabase` em vez de recriar clientes anon em arquivos específicos.
2. **Ícones Coesos:** Importe única e exclusivamente da biblioteca `lucide-react`.
3. **Semântica Tailwind:** Utilize os padrões definidos no `docs/design.md`.
4. **Isolamento de Contextos:** Toda chamada de estado que afete autenticação deve passar obrigatoriamente pelo hook customizado `useAuth()`.

# Sistema de Controle de Pagamentos de Clientes

Desenvolver um sistema web para controle de pagamentos de clientes com as seguintes características:

## Requisitos Críticos

### Fuso Horário
- CRÍTICO: Todo o sistema DEVE operar no fuso horário de São Paulo (GMT-3)
- Usar `date-fns-tz` para manipulação de datas
- Todas as datas devem ser convertidas e exibidas no fuso horário de São Paulo
- Armazenar datas no banco em UTC, mas sempre converter para São Paulo ao exibir
- Criar utilitários para conversão de datas:
  - `toSPDate`: Converte data para São Paulo
  - `formatToSP`: Formata data no padrão brasileiro
  - `getCurrentSPDate`: Obtém data atual em São Paulo

### Tecnologias Base
- React + TypeScript
- Vite como bundler
- Tailwind CSS para estilização
- Supabase para banco de dados
- Lucide React para ícones

### Banco de Dados

#### Tabelas Principais

1. `clients`
   - `id`: uuid (PK)
   - `name`: text (NOT NULL)
   - `phone`: text (NOT NULL)
   - `monthly_payment`: decimal(10,2) (NOT NULL)
   - `payment_due_day`: integer (1-31)
   - `status`: boolean (DEFAULT true)
   - `start_date`: timestamptz (NOT NULL)
   - `last_payment_date`: timestamptz
   - `next_payment_date`: timestamptz
   - `payment_frequency`: enum ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')
   - `created_at`: timestamptz
   - `updated_at`: timestamptz

2. `payments`
   - `id`: uuid (PK)
   - `client_id`: uuid (FK -> clients)
   - `amount`: decimal(10,2)
   - `payment_date`: timestamptz
   - `created_at`: timestamptz

3. `notifications`
   - `id`: uuid (PK)
   - `client_id`: uuid (FK -> clients)
   - `type`: text
   - `message`: text
   - `sent_at`: timestamptz
   - `status`: text
   - `created_at`: timestamptz

### Funcionalidades Principais

1. Gestão de Clientes
   - Cadastro com nome, telefone, valor e dia do pagamento
   - Edição de dados
   - Ativação/inativação
   - Histórico de pagamentos
   - Frequência de pagamento configurável

2. Controle de Pagamentos
   - Registro de pagamentos
   - Visualização por mês/dia
   - Status: em dia, atrasado, vencendo hoje
   - Cálculo automático da próxima data de pagamento

3. Relatórios
   - Total de clientes ativos/inativos
   - Pagamentos em dia/atrasados
   - Receita esperada/recebida

### Interface

1. Navegação Principal
   - Clientes
   - Pagamentos do Mês
   - Relatórios
   - Status

2. Tela de Clientes
   - Lista com filtros e busca
   - Modal de cadastro/edição
   - Indicadores visuais de status

3. Tela de Pagamentos
   - Visualização mensal/diária
   - Navegação entre meses
   - Agrupamento por status
   - Cards de receita

### Dependências Principais

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.7",
    "date-fns": "^2.30.0",
    "date-fns-tz": "^2.0.0",
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@tailwindcss/forms": "^0.5.7",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.2"
  }
}
```

### Considerações de Timezone

1. Funções de Data
```typescript
const SP_TIMEZONE = 'America/Sao_Paulo';

export function formatToSP(date: Date | string | null, formatStr: string): string {
  if (!date) return 'Nunca';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const spDate = utcToZonedTime(dateObj, SP_TIMEZONE);
  return format(spDate, formatStr, { locale: ptBR });
}

export function toSPDate(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return utcToZonedTime(dateObj, SP_TIMEZONE);
}

export function getCurrentSPDate(): Date {
  return utcToZonedTime(new Date(), SP_TIMEZONE);
}

export function convertToUTC(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const utcDate = zonedTimeToUtc(dateObj, SP_TIMEZONE);
  return utcDate.toISOString();
}
```

2. Uso no Banco de Dados
- Sempre armazenar datas em UTC
- Converter para São Paulo ao buscar
- Usar triggers para atualizar next_payment_date

3. Validações
- Considerar o fuso horário ao calcular atrasos
- Ajustar datas de vencimento para São Paulo
- Verificar mudança de dia ao converter timezones

### Estrutura de Arquivos
```
src/
  components/
    ClientForm.tsx
    ClientList.tsx
    MonthlyPayments.tsx
    PaymentHistory.tsx
    PaymentModal.tsx
    PaymentsDue.tsx
    Reports.tsx
  contexts/
    ClientContext.tsx
  lib/
    dates.ts
    supabase.ts
  types/
    supabase.ts
  App.tsx
  main.tsx
```
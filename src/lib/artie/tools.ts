// Declarações de Tools para o Gemini (Fase 1: Transações)
// Estas declarações são enviadas ao Gemini para que ele saiba
// quais ações pode disparar e quais parâmetros cada uma exige.

export const ARTIE_TOOLS_PHASE_1 = [
  {
    name: 'create_transaction',
    description: `Cria um novo lançamento financeiro (despesa, receita ou transferência).
Use quando o usuário quiser REGISTRAR, ADICIONAR ou LANÇAR algo novo.
NUNCA invente valores ou descrições. Se faltar informação essencial (valor ou descrição), pergunte antes de chamar esta tool.
Se o usuário não mencionar conta, crie sem conta (account_id omitido).
Se o usuário não mencionar categoria, crie sem categoria (category_id omitido).`,
    parameters: {
      type: 'OBJECT',
      properties: {
        description: {
          type: 'STRING',
          description: 'Descrição exata do lançamento. Ex: "Supermercado Extra", "Salário", "Gasolina".',
        },
        amount: {
          type: 'NUMBER',
          description: 'Valor numérico positivo. Ex: 87.50. NUNCA invente.',
        },
        type: {
          type: 'STRING',
          enum: ['expense', 'income', 'transfer'],
          description: '"expense" para gastos, "income" para receitas, "transfer" para transferências.',
        },
        date: {
          type: 'STRING',
          description: 'Data no formato YYYY-MM-DD. Use hoje se não mencionado.',
        },
        account_id: {
          type: 'STRING',
          description: 'ID da conta do usuário (veja entity_context.accounts). Omita se não mencionado.',
        },
        category_id: {
          type: 'STRING',
          description: 'ID da categoria (veja entity_context.categories). Omita se não mencionado.',
        },
        modalidade: {
          type: 'STRING',
          enum: ['unica', 'parcelada', 'recorrente'],
          description: 'Tipo do lançamento. Padrão: "unica".',
        },
        installment_total: {
          type: 'NUMBER',
          description: 'Número total de parcelas se modalidade=parcelada.',
        },
        recurrence_period: {
          type: 'STRING',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: 'Periodicidade se modalidade=recorrente.',
        },
        recurrence_interval: {
          type: 'NUMBER',
          description: 'Intervalo de recorrência. Ex: 1 para mensal, 2 para bimestral.',
        },
        status: {
          type: 'STRING',
          enum: ['pending', 'paid'],
          description: '"paid" se o pagamento já ocorreu, "pending" se é futuro. Padrão: "paid" para despesas passadas.',
        },
      },
      required: ['description', 'amount', 'type', 'date'],
    },
  },

  {
    name: 'confirm_transaction',
    description: `Dá baixa (confirma como pago) em um lançamento PENDENTE existente.
Use quando o usuário disser "confirmei", "paguei", "recebi", "dar baixa", "confirmar pagamento".
Busca o lançamento pelo que o usuário descreveu. Se encontrar mais de um, pergunte qual.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: {
          type: 'STRING',
          description: 'Trecho da descrição do lançamento para busca. Ex: "conta de luz", "aluguel".',
        },
        search_date: {
          type: 'STRING',
          description: 'Data aproximada do lançamento para refinar a busca (YYYY-MM-DD). Opcional.',
        },
        search_amount: {
          type: 'NUMBER',
          description: 'Valor do lançamento para refinar a busca. Opcional.',
        },
        confirm_date: {
          type: 'STRING',
          description: 'Data da confirmação (YYYY-MM-DD). Usa hoje se não informado.',
        },
      },
      required: ['search_description'],
    },
  },

  {
    name: 'update_transaction',
    description: `Edita campos de um lançamento existente.
Use quando o usuário quiser ALTERAR, MODIFICAR, CORRIGIR um lançamento já criado.
Busque o lançamento pelo que o usuário descreveu. Informe ao usuário o que será alterado antes de chamar.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: {
          type: 'STRING',
          description: 'Trecho da descrição do lançamento a editar.',
        },
        search_date: {
          type: 'STRING',
          description: 'Data aproximada do lançamento (YYYY-MM-DD). Opcional para refinar busca.',
        },
        search_amount: {
          type: 'NUMBER',
          description: 'Valor do lançamento para refinar a busca. Opcional.',
        },
        update_description: {
          type: 'STRING',
          description: 'Nova descrição. Omita se não for alterar.',
        },
        update_amount: {
          type: 'NUMBER',
          description: 'Novo valor. Omita se não for alterar.',
        },
        update_date: {
          type: 'STRING',
          description: 'Nova data (YYYY-MM-DD). Omita se não for alterar.',
        },
        update_account_id: {
          type: 'STRING',
          description: 'Novo account_id. Omita se não for alterar.',
        },
        update_category_id: {
          type: 'STRING',
          description: 'Novo category_id. Omita se não for alterar.',
        },
      },
      required: ['search_description'],
    },
  },

  {
    name: 'delete_transaction',
    description: `Remove um lançamento existente.
Use quando o usuário quiser EXCLUIR, APAGAR, REMOVER um lançamento.
Se for um lançamento avulso, ele é excluído diretamente.
Se for recorrente ou parcelado, o sistema pergunta ao usuário o escopo.
Você pode passar 'scope' se o usuário já especificou no texto (ex: "exclua todos os próximos" -> scope: "following", "exclua só este" -> scope: "this").`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: {
          type: 'STRING',
          description: 'Trecho da descrição do lançamento a excluir.',
        },
        search_date: {
          type: 'STRING',
          description: 'Data aproximada (YYYY-MM-DD). Opcional para refinar busca.',
        },
        search_amount: {
          type: 'NUMBER',
          description: 'Valor para refinar busca. Opcional.',
        },
        scope: {
          type: 'STRING',
          enum: ['this', 'following', 'all'],
          description: 'Escopo da exclusão: "this" (apenas este), "following" (este e todos os próximos). Omita se não informado.',
        },
      },
      required: ['search_description'],
    },
  },

  {
    name: 'list_transactions',
    description: `Busca lançamentos do usuário para responder QUALQUER pergunta financeira ou de saldo, tais como:
"Quanto gastei em mercado esse mês?", "Quais contas estão pendentes?", "Qual meu saldo no final do mês?", "Mostre meus gastos de julho".
Use esta tool OBRIGATORIAMENTE antes de responder qualquer pergunta sobre finanças, valores, contas ou saldos.
Retorna os lançamentos reais encontrados para você formular uma resposta em linguagem natural. NUNCA invente lançamentos.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'NUMBER',
          description: 'Máximo de lançamentos a retornar. Padrão: 50.',
        },
        date_from: {
          type: 'STRING',
          description: 'Data inicial do filtro (YYYY-MM-DD). Ex: primeiro dia do mês atual.',
        },
        date_to: {
          type: 'STRING',
          description: 'Data final do filtro (YYYY-MM-DD). Ex: último dia do mês desejado.',
        },
        type: {
          type: 'STRING',
          enum: ['income', 'expense', 'transfer'],
          description: 'Filtrar por tipo. Omita para todos.',
        },
        category_name: {
          type: 'STRING',
          description: 'Filtrar por nome de categoria (busca parcial). Ex: "mercado", "alimentação".',
        },
        status: {
          type: 'STRING',
          enum: ['pending', 'paid'],
          description: 'Filtrar por status. Omita para todos.',
        },
      },
      required: [],
    },
  },
];

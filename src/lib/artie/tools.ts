// Declarações de Tools para o Gemini (Fase 1: Transações)
// Estas declarações são enviadas ao Gemini para que ele saiba
// quais ações pode disparar e quais parâmetros cada uma exige.
//
// ATENÇÃO: a fonte da verdade em runtime é netlify/functions/artie-shared.cjs
// (compartilhada entre a Netlify Function e o server.cjs de dev). Este arquivo
// é a documentação viva em TypeScript — mantenha em sincronia.

export const ARTIE_TOOLS_PHASE_1 = [
  {
    name: 'create_transaction',
    description: `Cria um novo lançamento financeiro (despesa ou receita).
Use quando o usuário quiser REGISTRAR, ADICIONAR ou LANÇAR algo novo.
NUNCA invente valores, descrições ou IDs.
account_id e category_id são OBRIGATÓRIOS e devem ser IDs reais do entity_context.
Se faltar QUALQUER dado obrigatório (conta, categoria, descrição, valor, nº de parcelas de parcelada, periodicidade de recorrente), NÃO chame esta tool — colete o que falta com a tool ask_user, uma pergunta por vez, conforme a regra 7 do prompt.`,
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
          description: 'ID da conta ou cartão (entity_context.accounts / credit_cards). OBRIGATÓRIO. Nunca invente.',
        },
        destination_account_id: {
          type: 'STRING',
          description: 'ID da conta de DESTINO (entity_context.accounts). Obrigatório apenas para type transfer. NUNCA um cartão de crédito — pagamento de fatura tem fluxo próprio (pay_credit_card_invoice).',
        },
        category_id: {
          type: 'STRING',
          description: 'ID da categoria (entity_context.categories). OBRIGATÓRIO. Nunca invente.',
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
          description: 'Use "pending" para lançamentos em cartão de crédito (pagos na fatura). Para contas comuns com data hoje/passada, "paid".',
        },
      },
      required: ['description', 'amount', 'type', 'date', 'account_id', 'category_id'],
    },
  },

  {
    name: 'ask_user',
    description: `Faz UMA pergunta ao usuário para coletar um dado que falta antes de criar um lançamento (conta, categoria, descrição, nº de parcelas ou periodicidade).
Use SEMPRE que faltar um dado obrigatório do fluxo guiado (veja regra 7 do prompt). Faça UMA pergunta por vez.
Em "options", envie de 2 a 6 rótulos curtos e clicáveis usando os NOMES EXATOS das entidades do usuário (ex: "Nubank", "Alimentação") — nunca IDs. Omita "options" apenas quando a resposta for texto livre (ex: descrição).
NÃO use esta tool para confirmar exclusões nem quando já tiver todos os dados.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        question: {
          type: 'STRING',
          description: 'Pergunta curta em português, recapitulando o pedido. Ex: "Para o lançamento de R$ 10 — em qual cartão devo lançar?"',
        },
        options: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '2 a 6 opções clicáveis. Omita para resposta livre.',
        },
      },
      required: ['question'],
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
    description: `Edita campos (descrição, valor, data, conta, categoria ou STATUS) de um lançamento existente.
Use quando o usuário quiser ALTERAR, MODIFICAR, CORRIGIR ou MUDAR O STATUS de um lançamento (ex: "marcar como pendente", "marcar como pago", "alterar valor para X", "mudar data para Y").`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: {
          type: 'STRING',
          description: 'Trecho da descrição do lançamento a editar. Omita se o usuário informar apenas valor ou data.',
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
        update_status: {
          type: 'STRING',
          enum: ['pending', 'paid'],
          description: 'Novo status do lançamento ("pending" para não pago/pendente, "paid" para pago/confirmado). Omita se não for alterar.',
        },
      },
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
    description: `Busca lançamentos do usuário para responder perguntas sobre GASTOS, RECEITAS ou LISTAGEM de lançamentos, tais como:
"Quanto gastei em mercado esse mês?", "Quais contas estão pendentes?", "Mostre meus gastos de julho".
NÃO use esta tool para perguntas de SALDO (use get_account_balance nesse caso).
Retorna os lançamentos reais encontrados para você formular uma resposta em linguagem natural. NUNCA invente lançamentos.
ATENÇÃO: sem date_from/date_to, o período padrão vai do início do mês ATUAL ao fim do mês QUE VEM — lançamentos atrasados de meses anteriores ficam FORA. Para "contas em atraso/atrasadas/vencidas", use overdue_only: true.`,
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
          description: 'Filtrar por nome de categoria (busca parcial, sem acentos). Categoria pai agrega automaticamente as subcategorias. Ex: "mercado", "alimentação".',
        },
        status: {
          type: 'STRING',
          enum: ['pending', 'paid'],
          description: 'Filtrar por status. Omita para todos.',
        },
        overdue_only: {
          type: 'BOOLEAN',
          description: 'true = apenas lançamentos PENDENTES com data anterior a hoje (contas em atraso), sem limite inferior de data. Use para "em atraso", "atrasadas", "vencidas".',
        },
      },
      required: [],
    },
  },

  {
    name: 'get_invoice_summary',
    description: `Consulta a fatura de um cartão de crédito: total atual, vencimento e se já está fechada/paga.
Use para perguntas sobre fatura ("quanto está a fatura?", "quando vence?") e SEMPRE como primeiro passo do fluxo de pagamento de fatura (regra 12) — os valores apresentados ao usuário devem vir desta tool, nunca de memória.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        card_name: {
          type: 'STRING',
          description: 'Nome do cartão (busca parcial). Omita se o usuário tiver um único cartão.',
        },
        invoice_month: {
          type: 'STRING',
          description: 'Mês da fatura YYYY-MM. Omita para a fatura corrente.',
        },
      },
      required: [],
    },
  },

  {
    name: 'pay_credit_card_invoice',
    description: `Fecha e paga (ou agenda o pagamento de) a fatura de um cartão de crédito — mesmo fluxo da tela de Cartões.
Chame APENAS depois de coletar tudo pelo fluxo da regra 12 (valor, decisão sobre diferença quando o valor for menor, data e conta pagadora).
O total da fatura é recalculado internamente; se o valor pago for menor, é criado um Acerto de Saldo e a diferença é descartada ou lançada na fatura seguinte conforme difference_action.
Data futura = pagamento agendado (confirmado automaticamente na data); hoje/passado = pago.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        card_name: {
          type: 'STRING',
          description: 'Nome do cartão (busca parcial). Omita se houver um único cartão.',
        },
        invoice_month: {
          type: 'STRING',
          description: 'Mês da fatura YYYY-MM. Omita para a fatura corrente.',
        },
        amount: {
          type: 'NUMBER',
          description: 'Valor a pagar. NUNCA invente — confirme com o usuário (integral = total retornado por get_invoice_summary).',
        },
        payment_date: {
          type: 'STRING',
          description: 'Data do pagamento YYYY-MM-DD.',
        },
        payment_account_name: {
          type: 'STRING',
          description: 'Conta bancária de onde sai o pagamento (busca parcial). Omita se houver uma única conta.',
        },
        difference_action: {
          type: 'STRING',
          enum: ['discard', 'next_month'],
          description: 'Obrigatório quando amount < total: "discard" descarta a diferença, "next_month" lança na fatura do mês seguinte.',
        },
      },
      required: ['amount', 'payment_date'],
    },
  },

  {
    name: 'get_account_balance',
    description: `Calcula o saldo de uma ou todas as contas bancárias/carteiras do usuário.
Use esta tool OBRIGATORIAMENTE para QUALQUER pergunta de saldo, como:
"Qual meu saldo?", "Qual meu saldo no final do mês?", "Quanto vou ter em Julho?", "Quanto tenho na conta X?".
Esta tool já aplica toda a regra de negócio (recorrências, parcelas, faturas de cartão pendentes) e retorna o número final pronto — NÃO tente recalcular o saldo somando lançamentos de list_transactions.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        account_name: {
          type: 'STRING',
          description: 'Nome da conta (busca parcial). Omita para somar todas as contas.',
        },
        as_of_date: {
          type: 'STRING',
          description: 'Data de corte YYYY-MM-DD. Padrão: último dia do mês atual (saldo projetado do mês).',
        },
        only_confirmed: {
          type: 'BOOLEAN',
          description: 'true = considera só lançamentos já pagos. Padrão false (inclui pendentes, ou seja, saldo "projetado").',
        },
      },
      required: [],
    },
  },
];

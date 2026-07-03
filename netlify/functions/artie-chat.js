// artie-chat.js — Netlify Function
// Backend do Artie Agêntico: recebe mensagens, consulta entidades do usuário,
// chama o Gemini com Tool Calling e retorna resposta textual ou tool_call.
// A EXECUÇÃO das tools permanece no frontend (preserva RLS do Supabase).

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.VITE_GEMINI_API_KEY;

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
const SLIDING_WINDOW_SIZE = 15; // Máximo de mensagens enviadas ao Gemini por turno

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Tool Declarations (espelhadas do frontend/lib/artie/tools.ts) ────────────
// Mantemos aqui para evitar import de TS no runtime do Node.
const ARTIE_TOOLS = [
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
        description: { type: 'STRING', description: 'Descrição exata do lançamento.' },
        amount: { type: 'NUMBER', description: 'Valor numérico positivo. NUNCA invente.' },
        type: { type: 'STRING', enum: ['expense', 'income', 'transfer'] },
        date: { type: 'STRING', description: 'Data YYYY-MM-DD. Use hoje se não mencionado.' },
        account_id: { type: 'STRING', description: 'ID da conta (veja entity_context.accounts). Omita se não mencionado.' },
        category_id: { type: 'STRING', description: 'ID da categoria (veja entity_context.categories). Omita se não mencionado.' },
        modalidade: { type: 'STRING', enum: ['unica', 'parcelada', 'recorrente'] },
        installment_total: { type: 'NUMBER' },
        recurrence_period: { type: 'STRING', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        recurrence_interval: { type: 'NUMBER' },
        status: { type: 'STRING', enum: ['pending', 'paid'] },
      },
      required: ['description', 'amount', 'type', 'date'],
    },
  },
  {
    name: 'confirm_transaction',
    description: `Dá baixa em um lançamento PENDENTE existente.
Use quando o usuário disser "confirmei", "paguei", "recebi", "dar baixa".`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: { type: 'STRING', description: 'Trecho da descrição para busca.' },
        search_date: { type: 'STRING', description: 'Data aproximada YYYY-MM-DD. Opcional.' },
        search_amount: { type: 'NUMBER', description: 'Valor para refinar busca. Opcional.' },
        confirm_date: { type: 'STRING', description: 'Data da confirmação YYYY-MM-DD. Usa hoje se omitido.' },
      },
      required: ['search_description'],
    },
  },
  {
    name: 'update_transaction',
    description: `Edita campos de um lançamento existente.
Use quando o usuário quiser ALTERAR, CORRIGIR um lançamento já criado.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: { type: 'STRING' },
        search_date: { type: 'STRING' },
        search_amount: { type: 'NUMBER' },
        update_description: { type: 'STRING' },
        update_amount: { type: 'NUMBER' },
        update_date: { type: 'STRING' },
        update_account_id: { type: 'STRING' },
        update_category_id: { type: 'STRING' },
      },
      required: ['search_description'],
    },
  },
  {
    name: 'delete_transaction',
    description: `Remove um lançamento existente.
ATENÇÃO: sempre confirme com o usuário antes de emitir esta tool.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        search_description: { type: 'STRING' },
        search_date: { type: 'STRING' },
        search_amount: { type: 'NUMBER' },
      },
      required: ['search_description'],
    },
  },
  {
    name: 'list_transactions',
    description: `Busca lançamentos para responder perguntas financeiras do usuário.
Use SEMPRE antes de responder "quanto gastei em X" ou "quais contas pendentes".`,
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER' },
        date_from: { type: 'STRING', description: 'YYYY-MM-DD' },
        date_to: { type: 'STRING', description: 'YYYY-MM-DD' },
        type: { type: 'STRING', enum: ['income', 'expense', 'transfer'] },
        category_name: { type: 'STRING' },
        status: { type: 'STRING', enum: ['pending', 'paid'] },
      },
      required: [],
    },
  },
];

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(entityContext, userMemory, dateToday) {
  const tone = userMemory?.conversation_tone || 'normal';
  const toneGuidance = {
    casual: 'Use linguagem informal, amigável e descontraída. Pode usar emojis com moderação. Seja simpático.',
    normal: 'Use linguagem clara, direta e profissional. Equilibrado entre formal e informal.',
    tecnico: 'Use linguagem técnica. Mencione termos contábeis quando relevante (DRE, fluxo de caixa, competência, caixa). Seja preciso.',
  };

  const accountsList = entityContext.accounts
    .map(a => `  - ${a.name} (id: ${a.id}, tipo: ${a.type})`)
    .join('\n') || '  (nenhuma conta cadastrada)';

  const categoriesList = entityContext.categories
    .map(c => `  - ${c.name} (id: ${c.id})`)
    .join('\n') || '  (nenhuma categoria cadastrada)';

  const creditCardsList = entityContext.credit_cards
    .map(c => `  - ${c.name} (id: ${c.id}, fecha dia ${c.closing_day}, vence dia ${c.due_day}, limite: R$${c.limit.toFixed(2)}, usado: R$${c.current_balance.toFixed(2)})`)
    .join('\n') || '  (nenhum cartão cadastrado)';

  return `Você é o Artie, assistente financeiro inteligente do Recebimento $mart.

## Tom de Conversa
${toneGuidance[tone]}

## Hoje
${dateToday} (fuso horário: America/Sao_Paulo)

## Entidades do Usuário
Use estes dados reais ao emitir tool_calls. NUNCA invente IDs.

### Contas Bancárias/Carteiras
${accountsList}

### Categorias
${categoriesList}

### Cartões de Crédito
${creditCardsList}

## Regras Absolutas
1. NUNCA execute ações destrutivas (delete_transaction) sem confirmar com o usuário primeiro.
2. NUNCA invente valores, descrições ou IDs. Se faltar informação, PERGUNTE.
3. Ao emitir uma tool_call, use SEMPRE os IDs reais listados acima.
4. Se o usuário pedir informações financeiras ("quanto gastei"), chame list_transactions ANTES de responder.
5. Ao buscar um lançamento, se houver ambiguidade (mais de um resultado), informe o usuário e peça mais detalhes.
6. Para lançamentos sem conta ou categoria mencionada, omita account_id/category_id na tool_call.
7. Responda sempre em português do Brasil.
8. Seja conciso e direto. Após executar uma ação, confirme o que foi feito em uma linha.`;
}

// ─── Handler Principal ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!geminiApiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Serviço de IA indisponível (configuração ausente).' }),
    };
  }

  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    body = JSON.parse(raw);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Payload inválido.' }) };
  }

  const { messages, entity_context, user_memory, audio_base64, audio_mime_type } = body;

  // Validar presença de conteúdo (mensagem de texto OU áudio)
  const lastMessage = messages?.[messages.length - 1];
  const hasText = lastMessage?.role === 'user' && lastMessage?.content?.trim();
  const hasAudio = !!audio_base64;

  if (!hasText && !hasAudio) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Mensagem ou áudio obrigatório.' }) };
  }

  const dateToday = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-');

  const systemPrompt = buildSystemPrompt(entity_context || { accounts: [], categories: [], credit_cards: [] }, user_memory, dateToday);

  // Montar histórico da conversa (sliding window)
  const historyMessages = (messages || []).slice(-SLIDING_WINDOW_SIZE);

  // Converter para formato Gemini
  const geminiContents = historyMessages.map((msg) => {
    // Mensagem de áudio: a última mensagem do user pode conter áudio
    if (msg.role === 'user' && hasAudio && msg === lastMessage) {
      return {
        role: 'user',
        parts: [
          { inlineData: { mimeType: audio_mime_type || 'audio/webm', data: audio_base64 } },
          { text: 'Processe este áudio e execute a ação solicitada. Responda em português do Brasil.' },
        ],
      };
    }
    return {
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    };
  });

  // Se for áudio puro (sem histórico de texto), adicionar a mensagem de instrução
  if (hasAudio && !hasText) {
    geminiContents.push({
      role: 'user',
      parts: [
        { inlineData: { mimeType: audio_mime_type || 'audio/webm', data: audio_base64 } },
        { text: 'Processe este áudio e execute a ação solicitada. Responda em português do Brasil.' },
      ],
    });
  }

  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: geminiContents,
    tools: [{ functionDeclarations: ARTIE_TOOLS }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO', // Gemini decide sozinho: responde em texto OU emite tool_call
      },
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  };

  // Modelos suportados pela Gemini REST API (prioridade: 3.5-flash -> 2.5-flash -> 2.0-flash -> 1.5-flash)
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastGeminiError = null;

  for (const model of models) {
    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const resp = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });

      const result = await resp.json();

      if (!resp.ok) {
        const errorMsg = result?.error?.message || `HTTP ${resp.status}`;
        console.warn(`[Artie] Falha com modelo ${model}:`, errorMsg);
        lastGeminiError = errorMsg;

        if (resp.status === 429 || errorMsg.includes('Quota exceeded')) {
          break;
        }
        continue;
      }

      const candidate = result.candidates?.[0];
      if (!candidate) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: false, error: 'Sem resposta do Artie.' }),
        };
      }

      // Verificar se é um tool_call
      const toolCallPart = candidate.content?.parts?.find((p) => p.functionCall);
      if (toolCallPart) {
        const fn = toolCallPart.functionCall;
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            tool_call: { name: fn.name, args: fn.args || {} },
          }),
        };
      }

      // Resposta textual
      const textPart = candidate.content?.parts?.find((p) => p.text);
      const reply = textPart?.text || 'Não entendi o comando. Pode repetir?';

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, reply }),
      };
    } catch (err) {
      console.error(`[Artie] Erro ao chamar modelo ${model}:`, err);
      lastGeminiError = err.message;
    }
  }

  const friendlyError = formatFriendlyGeminiError(lastGeminiError);
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: false, error: friendlyError }),
  };
};

function formatFriendlyGeminiError(rawError) {
  if (!rawError) return 'O Artie não conseguiu responder no momento. Tente novamente em alguns instantes.';

  const str = String(rawError);

  if (str.includes('Quota exceeded') || str.includes('exceeded your current quota') || str.includes('429') || str.includes('RESOURCE_EXHAUSTED')) {
    const retryMatch = str.match(/retry in ([0-9.]+)\s*s/i);
    if (retryMatch && retryMatch[1]) {
      const seconds = Math.ceil(parseFloat(retryMatch[1]));
      if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60);
        return `O Artie atingiu o limite de cota de chamadas da IA. Por favor, aguarde cerca de ${minutes} minuto(s) antes de tentar novamente.`;
      }
      return `O Artie atingiu o limite de cota de chamadas da IA. Por favor, aguarde cerca de ${seconds} segundo(s) antes de tentar novamente.`;
    }
    return 'O Artie atingiu o limite temporário de uso da IA. Por favor, aguarde cerca de 1 minuto antes de tentar novamente.';
  }

  if (str.includes('API_KEY_INVALID') || str.includes('API key not valid')) {
    return 'O serviço do Artie está com uma chave de API inválida. Verifique sua chave VITE_GEMINI_API_KEY no arquivo .env.';
  }

  return `O Artie encontrou uma instabilidade temporária. Tente novamente em instantes. (${str})`;
}

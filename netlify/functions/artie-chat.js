// artie-chat.js — Netlify Function
// Backend do Artie Agêntico: recebe mensagens, consulta entidades do usuário,
// chama o Gemini com Tool Calling e retorna resposta textual ou tool_call.
// A EXECUÇÃO das tools permanece no frontend (preserva RLS do Supabase).

const { createClient } = require('@supabase/supabase-js');
const { ARTIE_TOOLS, buildSystemPrompt, formatFriendlyGeminiError } = require('./artie-shared.cjs');

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

// ─── Tool Declarations + System Prompt ────────────────────────────────────────
// Fonte da verdade: netlify/functions/artie-shared.cjs (compartilhado com server.cjs).

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
  const hasText = (messages || []).some(m => m.role === 'user' && m.content && String(m.content).trim().length > 0);
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
  const lastHistoryIndex = historyMessages.length - 1;
  const geminiContents = historyMessages.map((msg, idx) => {
    // Mensagem de áudio: a última mensagem do user pode conter áudio
    if (msg.role === 'user' && hasAudio && idx === lastHistoryIndex) {
      return {
        role: 'user',
        parts: [
          { inlineData: { mimeType: audio_mime_type || 'audio/webm', data: audio_base64 } },
          { text: 'Processe este áudio e execute a ação solicitada. Responda em português do Brasil.' },
        ],
      };
    }
    let textContent = msg.content || ' ';
    if (msg.tool_call && msg.tool_result) {
      textContent += `\n[Contexto da ação realizada: ${msg.tool_call.name} -> Dados retornados do banco: ${JSON.stringify(msg.tool_result)}]`;
    }
    return {
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: textContent }],
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
      maxOutputTokens: 2048,
    },
  };

  // Modelos suportados pela Gemini REST API (prioridade: 3.5-flash -> 2.5-flash -> 2.0-flash -> 1.5-flash)
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastGeminiError = null;

  for (const model of models) {
    try {
      // Modelos da família 2.5/3.5 têm "thinking" habilitado por padrão, que consome
      // do mesmo orçamento de maxOutputTokens e pode truncar a resposta visível.
      // Desativamos para respostas diretas (não precisamos de raciocínio exposto aqui).
      const isThinkingModel = /gemini-(2\.5|3\.5)/.test(model);
      const payloadForModel = isThinkingModel
        ? { ...geminiPayload, generationConfig: { ...geminiPayload.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
        : geminiPayload;

      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const resp = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadForModel),
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

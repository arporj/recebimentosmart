import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Send, Sparkles, RefreshCw, AlertTriangle, CheckCircle, Clock, AlertCircle, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';

interface Broadcast {
    id: string;
    subject: string;
    body: string;
    status: 'pending' | 'sent' | 'error' | string;
    created_at: string;
    processed_at: string | null;
    error_message: string | null;
    target_level?: string;
    created_by?: string | null;
}

export default function AdminBroadcastV2() {
    const { user } = useAuth();
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [targetLevel, setTargetLevel] = useState('all');
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loading, setLoading] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [fetchingHistory, setFetchingHistory] = useState(false);
    const [latestGeminiModel, setLatestGeminiModel] = useState<string | null>(null);
    const [hasNewGeminiVersion, setHasNewGeminiVersion] = useState(false);
    const [showVariablesHelp, setShowVariablesHelp] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');
    const [showSubjectEmojis, setShowSubjectEmojis] = useState(false);
    const [showBodyEmojis, setShowBodyEmojis] = useState(false);

    const EMAIL_EMOJIS = [
        '🚀', '📢', '🎉', '💰', '📅', '✉️', 
        '🔥', '✅', '✨', '💡', '👥', '📈', 
        '🌟', '🔔', '🛠️', '🎯', '🔒', '🎁'
    ];

    const insertEmoji = (emoji: string, isSubject: boolean) => {
        const inputId = isSubject ? 'broadcast-subject' : 'broadcast-body';
        const element = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement;
        
        if (!element) {
            if (isSubject) {
                setSubject(prev => prev + emoji);
            } else {
                setBody(prev => prev + emoji);
            }
            return;
        }

        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;
        const text = element.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        if (isSubject) {
            setSubject(before + emoji + after);
        } else {
            setBody(before + emoji + after);
        }

        setTimeout(() => {
            element.focus();
            const newCursorPos = start + emoji.length;
            element.setSelectionRange(newCursorPos, newCursorPos);
        }, 50);
    };

    useEffect(() => {
        fetchBroadcastHistory();
        checkForNewGeminiVersion();
    }, []);

    const checkForNewGeminiVersion = async () => {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );
            if (!response.ok) throw new Error('Erro ao listar modelos do Gemini');

            const data = await response.json();
            const models = data?.models || [];

            // A versão que estamos utilizando atualmente no sistema
            const CURRENT_VERSION = 3.5;
            let highestVersion = CURRENT_VERSION;
            let bestModelName = 'gemini-3.5-flash';

            models.forEach((m: any) => {
                const name = m.name || '';
                // Procura por modelos gemini-X-flash ou gemini-X.Y-flash (ex: models/gemini-2.5-flash, models/gemini-3.5-flash)
                const match = name.match(/models\/gemini-(\d+(\.\d+)?)-flash/);
                if (match) {
                    const versionNum = parseFloat(match[1]);
                    if (versionNum > highestVersion) {
                        highestVersion = versionNum;
                        bestModelName = name.replace('models/', '');
                    }
                }
            });

            if (highestVersion > CURRENT_VERSION) {
                setLatestGeminiModel(bestModelName);
                setHasNewGeminiVersion(true);
            }
        } catch (err) {
            console.warn('Não foi possível verificar novas versões do Gemini na API:', err);
        }
    };

    const fetchBroadcastHistory = async () => {
        try {
            setFetchingHistory(true);
            const { data, error } = await supabase
                .from('email_broadcasts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBroadcasts(data || []);
        } catch (err: any) {
            console.error('Erro ao buscar histórico de disparos:', err);
            toast.error('Erro ao carregar histórico: ' + err.message);
        } finally {
            setFetchingHistory(false);
        }
    };

    const handleImproveText = async () => {
        if (!body.trim()) {
            toast.error('Escreva alguma mensagem no corpo antes de pedir para a IA melhorar!');
            return;
        }

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            toast.error('Chave de API do Gemini não configurada no ambiente (.env).');
            return;
        }

        try {
            setOptimizing(true);
            
            const prompt = `Você é um copywriter profissional especialista em e-mails de marketing e comunicados.
Melhore o assunto e o corpo do e-mail a seguir para torná-lo extremamente persuasivo, amigável e profissional.
Insira emojis contextuais e amigáveis de forma estratégica e moderada (ex: 🚀, 🎉, 📢, 💰, ✨, 📅) tanto no assunto quanto no corpo para aumentar a taxa de engajamento e a atratividade visual.
Mantenha todos os links, placeholders de variáveis (ex: {{name}}, {{email}}) e qualquer tag HTML se houver no corpo.

E-mail original:
Assunto: ${subject}
Corpo: ${body}

Responda APENAS com o formato estruturado a seguir, sem nenhuma introdução, explicação adicional ou aspas extras:
ASSUNTO: [Escreva aqui o assunto aprimorado]
CORPO: [Escreva aqui o corpo aprimorado, mantendo formatação HTML se aplicável]`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: prompt
                                    }
                                ]
                            }
                        ]
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Erro na API do Gemini: ${response.statusText}`);
            }

            const resData = await response.json();
            const improvedText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (improvedText) {
                const subjectMatch = improvedText.match(/ASSUNTO:\s*(.*)/i);
                const bodyMatch = improvedText.match(/CORPO:\s*([\s\S]*)/i);
                
                let finalSubject = subject;
                let finalBody = body;
                
                if (subjectMatch) {
                    finalSubject = subjectMatch[1].trim();
                }
                
                if (bodyMatch) {
                    finalBody = bodyMatch[1].trim();
                } else {
                    // Fallback caso o Gemini retorne o formato de forma ligeiramente diferente
                    finalBody = improvedText.replace(/ASSUNTO:\s*(.*)/i, '').replace(/CORPO:\s*/i, '').trim();
                }

                // Substituir tags <br> ou <br/> por quebras de linha normais (\n) para exibição correta no textarea
                finalBody = finalBody.replace(/<br\s*\/?>/gi, '\n');

                setSubject(finalSubject);
                setBody(finalBody);
                toast.success('Assunto e conteúdo aprimorados com inteligência artificial!');
            } else {
                throw new Error('Retorno inválido do modelo.');
            }
        } catch (err: any) {
            console.error('Erro ao chamar Gemini:', err);
            toast.error('Falha ao melhorar texto: ' + err.message);
        } finally {
            setOptimizing(false);
        }
    };

    const handleSendBroadcast = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!subject.trim()) {
            toast.error('Informe o assunto do e-mail.');
            return;
        }
        if (!body.trim()) {
            toast.error('Escreva o conteúdo da mensagem.');
            return;
        }

        setShowConfirmModal(true);
    };

    const executeSendBroadcast = async () => {
        try {
            setLoading(true);
            setShowConfirmModal(false);

            // 1. Inserir o registro de disparo na tabela como pendente
            const { data: newBroadcast, error: insertError } = await supabase
                .from('email_broadcasts')
                .insert({
                    subject: subject.trim(),
                    body: body.trim(),
                    status: 'pending',
                    target_level: targetLevel,
                    created_by: user?.id || null
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // 2. Chamar a Edge Function diretamente para processar a fila de disparos de e-mail de imediato
            toast.loading('Iniciando processamento e envio em lote...');
            
            const { error: invokeError } = await supabase.functions.invoke('process-broadcast-queue');
            
            toast.dismiss();

            if (invokeError) {
                console.warn('Erro ao invocar processador de fila de disparos:', invokeError);
                toast.error('Disparo enfileirado, mas houve um erro ao processá-lo imediatamente. Ele será processado em segundo plano.');
            } else {
                toast.success('Disparo em lote concluído com sucesso!');
                setSubject('');
                setBody('');
                setTargetLevel('all');
            }

            fetchBroadcastHistory();
        } catch (err: any) {
            toast.dismiss();
            console.error('Erro ao realizar disparo em lote:', err);
            toast.error('Erro ao disparar e-mails: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 w-full relative max-w-7xl mx-auto pb-10">
            <div className="mb-8 animate-in fade-in duration-300">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <div className="bg-teal-50 p-2 rounded-2xl border border-teal-100">
                        <Mail className="text-[#0d9488] w-8 h-8" />
                    </div>
                    Disparos em Lote (Broadcast)
                </h1>
                <p className="text-slate-500 mt-1">
                    Crie e envie comunicados, novidades e atualizações por e-mail para todos os usuários cadastrados no sistema.
                </p>
            </div>

            {hasNewGeminiVersion && latestGeminiModel && (
                <div className="mb-6 bg-gradient-to-r from-teal-500/10 to-indigo-500/10 border-2 border-teal-200/80 rounded-3xl p-5 shadow-sm animate-in slide-in-from-top duration-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-start gap-3">
                        <div className="bg-gradient-to-r from-teal-500 to-indigo-500 p-2.5 rounded-2xl text-white shadow-md shadow-teal-500/10">
                            <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-sm text-slate-800">Nova versão do Gemini disponível!</h3>
                            <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                                Detectamos a disponibilidade do modelo <span className="font-extrabold text-[#0d9488]">{latestGeminiModel}</span> no Google AI Studio. 
                                Você pode modificar o sistema nas configurações de código para atualizar a IA e usufruir de maior velocidade e assertividade.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setHasNewGeminiVersion(false)}
                        className="text-xs font-black uppercase text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-xl hover:bg-slate-100/80 active:scale-95 transition-all self-end md:self-auto shrink-0"
                    >
                        Entendido
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Form Column */}
                <div className="lg:col-span-7 space-y-6">
                    <form 
                        onSubmit={handleSendBroadcast}
                        className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 space-y-5 animate-in slide-in-from-bottom duration-500"
                    >
                        <h2 className="text-lg font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                            <Send size={18} className="text-teal-600" />
                            Nova Transmissão
                        </h2>

                        <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Público-Alvo (Segmentação por Assinatura)</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                {[
                                    { value: 'all', label: 'Todos', desc: 'Toda a base ativa' },
                                    { value: 'basico', label: 'Básico', desc: 'Básico e sup.' },
                                    { value: 'pro', label: 'Pró', desc: 'Pró e Premium' },
                                    { value: 'premium', label: 'Premium', desc: 'Apenas Premium' },
                                    { value: 'me', label: 'Somente Eu', desc: 'Envio de teste' }
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setTargetLevel(opt.value)}
                                        disabled={loading}
                                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 text-center transition-all ${
                                            targetLevel === opt.value
                                                ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-sm'
                                                : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-600 hover:border-slate-200'
                                        }`}
                                    >
                                        <span className="text-xs font-extrabold tracking-tight">{opt.label}</span>
                                        <span className={`text-[8px] mt-0.5 font-bold ${targetLevel === opt.value ? 'text-teal-600' : 'text-slate-400'}`}>{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Assunto do E-mail</label>
                            <div className="relative">
                                <input
                                    id="broadcast-subject"
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="ex: [Novidade] Nova tela de fluxo de caixa liberada!"
                                    disabled={loading}
                                    className="w-full rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 transition-all pl-4 pr-12 py-3 text-slate-900 text-sm font-semibold"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSubjectEmojis(!showSubjectEmojis)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 active:scale-90 transition-all p-1 text-sm"
                                    title="Inserir Emoji no Assunto"
                                >
                                    😊
                                </button>
                                
                                {showSubjectEmojis && (
                                    <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 grid grid-cols-6 gap-1.5 z-40 w-52 animate-in fade-in slide-in-from-top-2 duration-200">
                                        {EMAIL_EMOJIS.map(emoji => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => {
                                                    insertEmoji(emoji, true);
                                                    setShowSubjectEmojis(false);
                                                }}
                                                className="text-base p-1.5 hover:bg-slate-50 rounded-lg active:scale-90 transition-all text-center"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Conteúdo do E-mail (Suporta HTML)</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowVariablesHelp(!showVariablesHelp)}
                                        className="text-slate-400 hover:text-teal-600 transition-colors flex items-center"
                                        title="Ver variáveis de personalização disponíveis"
                                    >
                                        <HelpCircle size={14} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowBodyEmojis(!showBodyEmojis)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all"
                                        title="Inserir Emoji no Conteúdo"
                                    >
                                        😊 <span className="hidden sm:inline">Emojis</span>
                                    </button>
                                    
                                    {showBodyEmojis && (
                                        <div className="absolute right-0 sm:right-full sm:mr-2 top-full sm:top-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 grid grid-cols-6 gap-1.5 z-40 w-52 animate-in fade-in slide-in-from-top-2 sm:slide-in-from-right-2 duration-200">
                                            {EMAIL_EMOJIS.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => {
                                                        insertEmoji(emoji, false);
                                                        setShowBodyEmojis(false);
                                                    }}
                                                    className="text-base p-1.5 hover:bg-slate-50 rounded-lg active:scale-90 transition-all text-center"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleImproveText}
                                        disabled={optimizing || loading || !body.trim()}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${optimizing ? 'animate-pulse' : ''}`}
                                        title="O Gemini reescreverá o assunto e conteúdo de forma profissional"
                                    >
                                        <Sparkles size={13} className={optimizing ? 'animate-spin' : ''} />
                                        {optimizing ? 'Aprimorando...' : 'Melhorar com Gemini Pro'}
                                    </button>
                                </div>
                            </div>

                            {showVariablesHelp && (
                                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                    <h4 className="font-extrabold text-slate-700 uppercase tracking-wider text-[10px]">Variáveis Dinâmicas Disponíveis</h4>
                                    <p className="text-slate-500 leading-normal font-semibold">
                                        Você pode utilizar as tags abaixo no assunto ou corpo do e-mail. Elas serão substituídas automaticamente com as informações de cada destinatário no momento do envio:
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        <div className="p-2.5 bg-white border border-slate-100 rounded-xl flex items-start gap-2">
                                            <code className="text-teal-600 font-extrabold font-mono bg-teal-50 px-1.5 py-0.5 rounded text-[10px]">{"{{name}}"}</code>
                                            <div>
                                                <p className="font-extrabold text-slate-700">Nome do Usuário</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Substitui pelo nome do destinatário. Ex: João da Silva</p>
                                            </div>
                                        </div>
                                        <div className="p-2.5 bg-white border border-slate-100 rounded-xl flex items-start gap-2">
                                            <code className="text-teal-600 font-extrabold font-mono bg-teal-50 px-1.5 py-0.5 rounded text-[10px]">{"{{email}}"}</code>
                                            <div>
                                                <p className="font-extrabold text-slate-700">E-mail do Usuário</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Substitui pelo e-mail do destinatário. Ex: joao@exemplo.com</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Abas do Editor */}
                            <div className="flex border-b border-slate-100 mb-2">
                                <button
                                    key="tab-write"
                                    type="button"
                                    onClick={() => setEditorTab('write')}
                                    className={`py-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                                        editorTab === 'write'
                                            ? 'border-teal-600 text-teal-600'
                                            : 'border-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Escrever
                                </button>
                                <button
                                    key="tab-preview"
                                    type="button"
                                    onClick={() => setEditorTab('preview')}
                                    className={`py-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                                        editorTab === 'preview'
                                            ? 'border-teal-600 text-teal-600'
                                            : 'border-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Prévia
                                </button>
                            </div>

                            {editorTab === 'write' ? (
                                <textarea
                                    id="broadcast-body"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="Olá {{name}},\n\nEstamos muito felizes em anunciar uma nova funcionalidade..."
                                    rows={10}
                                    disabled={loading || optimizing}
                                    className="w-full rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 transition-all px-4 py-3 text-slate-900 text-sm font-medium font-mono"
                                />
                            ) : (
                                <div 
                                    className="w-full min-h-[250px] max-h-[400px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-slate-800 text-sm font-medium leading-relaxed font-sans scrollbar-thin select-text"
                                >
                                    {body.trim() ? (
                                        <div 
                                            className="max-w-none break-words select-text whitespace-pre-wrap"
                                            dangerouslySetInnerHTML={{ 
                                                __html: body
                                                    .replace(/{{name}}/g, 'João da Silva')
                                                    .replace(/{{nome}}/g, 'João da Silva')
                                                    .replace(/{{email}}/g, 'joao@exemplo.com')
                                            }} 
                                        />
                                    ) : (
                                        <p className="text-slate-400 text-center py-10 font-bold">Nenhum conteúdo para visualizar.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-400">
                                <AlertTriangle size={16} className="text-amber-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {targetLevel === 'all' && 'Dispara para toda a base ativa'}
                                    {targetLevel === 'basico' && 'Dispara para assinantes Básico, Pró e Premium'}
                                    {targetLevel === 'pro' && 'Dispara para assinantes Pró e Premium'}
                                    {targetLevel === 'premium' && 'Dispara apenas para assinantes Premium'}
                                    {targetLevel === 'me' && 'Dispara apenas para você (e-mail de teste)'}
                                </span>
                            </div>
                            <button
                                type="submit"
                                disabled={loading || optimizing}
                                className="px-8 py-3 bg-teal-600 text-white rounded-xl text-sm font-black shadow-lg shadow-teal-600/20 hover:bg-teal-700 hover:shadow-teal-700/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send size={16} />
                                {loading ? 'Enviando...' : 'Disparar E-mails'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* History Column */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 space-y-4 animate-in slide-in-from-bottom duration-500 delay-100">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Clock size={18} className="text-slate-500" />
                                Histórico de Envios
                            </h2>
                            <button 
                                onClick={fetchBroadcastHistory}
                                disabled={fetchingHistory}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <RefreshCw size={15} className={fetchingHistory ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1 no-scrollbar space-y-3">
                            {fetchingHistory && broadcasts.length === 0 ? (
                                <div className="py-10 text-center text-slate-400 font-bold text-sm animate-pulse">Carregando histórico...</div>
                            ) : broadcasts.length === 0 ? (
                                <div className="py-10 text-center text-slate-400 font-bold text-sm">Nenhum envio registrado.</div>
                            ) : (
                                broadcasts.map((b) => (
                                    <div key={b.id} className="pt-3 first:pt-0 space-y-1.5">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-extrabold text-sm text-slate-800 line-clamp-1">{b.subject}</h4>
                                                    {b.target_level && (
                                                        <span className={`shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                                            b.target_level === 'all' 
                                                                ? 'bg-teal-50 text-teal-600 border-teal-100'
                                                                : b.target_level === 'basico'
                                                                ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                                : b.target_level === 'pro'
                                                                ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                                : b.target_level === 'premium'
                                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                                        }`}>
                                                            {b.target_level === 'all' && 'Todos'}
                                                            {b.target_level === 'basico' && 'Básico+'}
                                                            {b.target_level === 'pro' && 'Pró+'}
                                                            {b.target_level === 'premium' && 'Premium'}
                                                            {b.target_level === 'me' && 'Somente Eu'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {/* Status Badge */}
                                            {b.status === 'sent' || b.status === 'completed' ? (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-0.5">
                                                    <CheckCircle size={8} /> Enviado
                                                </span>
                                            ) : b.status === 'pending' || b.status === 'processing' ? (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-0.5">
                                                    <Clock size={8} /> Processando
                                                </span>
                                            ) : (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-0.5">
                                                    <AlertCircle size={8} /> Falhou
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-[10px] text-slate-400 font-semibold">
                                            Criado em {format(parseISO(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            {b.processed_at && ` · Processado em ${format(parseISO(b.processed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                                        </p>

                                        {b.error_message && (
                                            <div className="p-2 rounded bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-600 leading-normal flex items-start gap-1">
                                                <AlertCircle size={10} className="shrink-0 mt-0.5" />
                                                <span>{b.error_message}</span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Confirmação Premium */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-amber-500 shrink-0">
                                <AlertTriangle size={24} className="animate-bounce" />
                            </div>
                            <div className="space-y-1.5">
                                <h3 className="text-lg font-black text-slate-800">Confirmar Transmissão</h3>
                                <p className="text-xs text-slate-500 leading-normal font-semibold">
                                    Você está prestes a disparar este e-mail para <span className="font-extrabold text-teal-600">{
                                        {
                                            all: 'TODOS os usuários ativos do sistema',
                                            basico: 'usuários ativos dos planos Básico, Pró e Premium',
                                            pro: 'usuários ativos dos planos Pró e Premium',
                                            premium: 'apenas assinantes ativos do plano Premium',
                                            me: 'apenas VOCÊ (teste)'
                                        }[targetLevel] || 'usuários selecionados'
                                    }</span>.
                                </p>
                                <p className="text-xs text-slate-400 font-medium">
                                    Esta ação não poderá ser desfeita após o envio dos lotes. Deseja realmente prosseguir?
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowConfirmModal(false)}
                                disabled={loading}
                                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={executeSendBroadcast}
                                disabled={loading}
                                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-600/20 hover:bg-teal-700 hover:shadow-teal-700/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <Send size={12} />
                                {loading ? 'Enviando...' : 'Confirmar e Enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

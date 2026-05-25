import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Send, Sparkles, RefreshCw, AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Broadcast {
    id: string;
    subject: string;
    body: string;
    status: 'pending' | 'sent' | 'error' | string;
    created_at: string;
    processed_at: string | null;
    error_message: string | null;
}

export default function AdminBroadcastV2() {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loading, setLoading] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [fetchingHistory, setFetchingHistory] = useState(false);

    useEffect(() => {
        fetchBroadcastHistory();
    }, []);

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
            
            const prompt = `Melhore o texto do e-mail de anúncio para os usuários a seguir de forma extremamente persuasiva, amigável e profissional. Mantenha os links e qualquer tag HTML se houver. Escreva APENAS a versão melhorada da mensagem, sem nenhuma introdução, explicação adicional ou aspas extras:\n\n${body}`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
                setBody(improvedText.trim());
                toast.success('Texto aprimorado com inteligência artificial!');
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

    const handleSendBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!subject.trim()) {
            toast.error('Informe o assunto do e-mail.');
            return;
        }
        if (!body.trim()) {
            toast.error('Escreva o conteúdo da mensagem.');
            return;
        }

        const confirm = window.confirm(
            `ATENÇÃO: Você está prestes a disparar esta mensagem para TODOS os usuários ativos do sistema. Deseja prosseguir com o disparo?`
        );

        if (!confirm) return;

        try {
            setLoading(true);

            // 1. Inserir o registro de disparo na tabela como pendente
            const { data: newBroadcast, error: insertError } = await supabase
                .from('email_broadcasts')
                .insert({
                    subject: subject.trim(),
                    body: body.trim(),
                    status: 'pending'
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

                        <div className="space-y-1.5">
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Assunto do E-mail</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="ex: [Novidade] Nova tela de fluxo de caixa liberada!"
                                disabled={loading}
                                className="w-full rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 transition-all px-4 py-3 text-slate-900 text-sm font-semibold"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Conteúdo do E-mail (Suporta HTML)</label>
                                <button
                                    type="button"
                                    onClick={handleImproveText}
                                    disabled={optimizing || loading || !body.trim()}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${optimizing ? 'animate-pulse' : ''}`}
                                    title="O Gemini reescreverá sua mensagem de forma profissional"
                                >
                                    <Sparkles size={13} className={optimizing ? 'animate-spin' : ''} />
                                    {optimizing ? 'Aprimorando...' : 'Melhorar com Gemini Pro'}
                                </button>
                            </div>
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Olá {{name}},\n\nEstamos muito felizes em anunciar uma nova funcionalidade..."
                                rows={10}
                                disabled={loading || optimizing}
                                className="w-full rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 transition-all px-4 py-3 text-slate-900 text-sm font-medium font-mono"
                            />
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-400">
                                <AlertTriangle size={16} className="text-amber-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Dispara para toda a base ativa</span>
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
                                            <h4 className="font-extrabold text-sm text-slate-800 line-clamp-1 flex-1">{b.subject}</h4>
                                            
                                            {/* Status Badge */}
                                            {b.status === 'sent' ? (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-0.5">
                                                    <CheckCircle size={8} /> Enviado
                                                </span>
                                            ) : b.status === 'pending' ? (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-0.5">
                                                    <Clock size={8} /> Pendente
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
        </div>
    );
}

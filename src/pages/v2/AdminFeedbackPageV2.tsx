import { useState, useEffect } from 'react';
import { MessageCircle, Clock, Inbox } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatToSP } from '../../lib/dates';
import type { Feedback } from '../../types/feedback';
import FeedbackDetailsV2 from '../../components/v2/FeedbackDetailsV2';

export default function AdminFeedbackPageV2() {
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [filter, setFilter] = useState<'all' | 'unread' | 'open' | 'in_progress' | 'closed'>('unread');

    useEffect(() => {
        fetchFeedbacks();
    }, [filter]);

    useEffect(() => {
        const subscription = supabase
            .channel('admin_feedback_list_v2')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'feedbacks'
            }, () => { fetchFeedbacks(); })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'feedback_messages'
            }, () => { fetchFeedbacks(); })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, []);

    const fetchFeedbacks = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.rpc('get_admin_feedbacks');
            if (error) throw error;

            let filteredData = data || [];
            if (filter === 'unread') {
                filteredData = filteredData.filter((f: any) => f.has_unread_admin);
            } else if (filter === 'open') {
                filteredData = filteredData.filter((f: any) => f.status === 'open');
            } else if (filter === 'in_progress') {
                filteredData = filteredData.filter((f: any) => f.status === 'in_progress');
            } else if (filter === 'closed') {
                filteredData = filteredData.filter((f: any) => f.status === 'closed');
            }

            const mappedData = filteredData.map((f: any) => ({
                ...f,
                user: f.user_data
            }));

            setFeedbacks(mappedData);
        } catch (error) {
            console.error('Erro ao buscar feedbacks:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-emerald-100 text-emerald-700';
            case 'in_progress': return 'bg-amber-100 text-amber-700';
            case 'resolved': return 'bg-blue-100 text-blue-700';
            case 'closed': return 'bg-slate-200 text-slate-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'open': return 'Aberto';
            case 'in_progress': return 'Em Análise';
            case 'resolved': return 'Resolvido';
            case 'closed': return 'Fechado';
            default: return status;
        }
    };

    const filters = [
        { key: 'unread' as const, label: 'Não Lidos' },
        { key: 'open' as const, label: 'Abertos' },
        { key: 'in_progress' as const, label: 'Em Análise' },
        { key: 'closed' as const, label: 'Fechados' },
        { key: 'all' as const, label: 'Todos' },
    ];

    if (selectedFeedback) {
        return (
            <div className="w-full max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
                <FeedbackDetailsV2
                    feedback={selectedFeedback}
                    onBack={() => {
                        setSelectedFeedback(null);
                        fetchFeedbacks();
                    }}
                    isAdminView={true}
                />
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-custom/10 rounded-xl text-custom">
                        <MessageCircle className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestão de Feedbacks</h2>
                        <p className="text-slate-500">Gerencie críticas e sugestões dos usuários da plataforma.</p>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2 flex flex-wrap gap-1">
                {filters.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${filter === f.key
                            ? 'bg-custom text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
                    <span className="text-slate-500 font-medium mt-3">Carregando feedbacks...</span>
                </div>
            ) : feedbacks.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">Nenhum feedback encontrado</h3>
                    <p className="text-slate-400 mt-2 font-medium">Nenhum item corresponde aos filtros selecionados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                        {feedbacks.map((feedback) => (
                            <button
                                key={feedback.id}
                                onClick={() => setSelectedFeedback(feedback)}
                                className="block w-full hover:bg-slate-50/80 transition-colors text-left group"
                            >
                                <div className="px-6 py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {feedback.has_unread_admin && (
                                                <span className="w-2.5 h-2.5 bg-custom rounded-full shrink-0 animate-pulse" title="Nova mensagem"></span>
                                            )}
                                            <p className={`text-sm truncate ${feedback.has_unread_admin ? 'text-slate-900 font-bold' : 'text-slate-700 font-medium'}`}>
                                                {feedback.subject}
                                            </p>
                                            <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shrink-0 ${feedback.type === 'Crítica' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {feedback.type}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shrink-0 ${getStatusColor(feedback.status)}`}>
                                            {getStatusLabel(feedback.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <div>
                                            <p className="flex items-center text-sm text-slate-500 font-medium">
                                                <span className="font-bold text-slate-600 mr-1">Usuário:</span>
                                                {/* @ts-ignore - Supabase join returns user object */}
                                                {feedback.user?.user_metadata?.name || feedback.user?.email || 'Desconhecido'}
                                            </p>
                                            <p className="text-xs text-slate-400 font-medium">
                                                {/* @ts-ignore */}
                                                {feedback.user?.email}
                                            </p>
                                        </div>
                                        <div className="flex items-center text-xs text-slate-400 font-medium">
                                            <Clock className="shrink-0 mr-1.5 h-3.5 w-3.5 text-slate-300" />
                                            <p>Atualizado em {formatToSP(feedback.last_activity_at)}</p>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { formatToSP } from '../../../lib/dates';
import type { Feedback } from '../../../types/feedback';
import { CreateFeedbackModal } from '../../../components/feedback/CreateFeedbackModal';
import { FeedbackDetails } from '../../../components/feedback/FeedbackDetails';

export function FeedbackV2() {
    const { user } = useAuth();
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

    useEffect(() => {
        if (user) {
            fetchFeedbacks();

            const subscription = supabase
                .channel('user_feedback_list_v2')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'feedbacks',
                    filter: `user_id=eq.${user.id}`
                }, () => {
                    fetchFeedbacks();
                })
                .subscribe();

            return () => {
                subscription.unsubscribe();
            };
        }
    }, [user]);

    const fetchFeedbacks = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('feedbacks')
                .select('*')
                .eq('user_id', user!.id)
                .order('last_activity_at', { ascending: false });

            if (error) throw error;
            setFeedbacks(data || []);
        } catch (error) {
            console.error('Erro ao buscar feedbacks:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'open': return 'bg-emerald-100/50 text-emerald-700 border-emerald-200';
            case 'in_progress': return 'bg-amber-100/50 text-amber-700 border-amber-200';
            case 'resolved': return 'bg-blue-100/50 text-blue-700 border-blue-200';
            case 'closed': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
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

    const getTypeStyle = (type: string) => {
        switch (type) {
            case 'Crítica': return 'bg-red-50 text-red-600';
            case 'Sugestão': return 'bg-purple-50 text-purple-600';
            default: return 'bg-slate-50 text-slate-600';
        }
    }

    // TODO: Adapt FeedbackDetails into a V2 format in the future, for now using existing
    if (selectedFeedback) {
        return (
            <div className="max-w-7xl mx-auto">
                <FeedbackDetails
                    feedback={selectedFeedback}
                    onBack={() => {
                        setSelectedFeedback(null);
                        fetchFeedbacks();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="text-slate-900 w-full max-w-7xl mx-auto font-['Inter'] h-full flex flex-col">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Críticas e Sugestões</h2>
                    <p className="text-slate-500 text-sm mt-1">Acompanhe seus envios e nos ajude a evoluir o app.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-[#14b8a6] text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all font-bold text-sm shadow-md"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Novo Feedback
                    </button>
                </div>
            </header>

            {/* Content */}
            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <div className="w-8 h-8 border-4 border-[#14b8a6] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : feedbacks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-slate-300">chat_bubble</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Sua voz é importante</h3>
                    <p className="text-slate-500 text-center max-w-md mb-8 text-sm">
                        Ainda não temos nenhum registro seu. Encontrou um bug ou pensou numa melhoria fantástica? Registre agora.
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors text-sm"
                    >
                        Enviar meu primeiro Feedback
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {feedbacks.map((feedback) => (
                        <div
                            key={feedback.id}
                            onClick={() => setSelectedFeedback(feedback)}
                            className="group bg-white border border-slate-200 p-5 rounded-2xl cursor-pointer hover:border-[#14b8a6]/40 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wider ${getTypeStyle(feedback.type)}`}>
                                        {feedback.type}
                                    </span>
                                    {feedback.has_unread_user && (
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#14b8a6] bg-[#14b8a6]/10 px-2 py-0.5 rounded-full animate-pulse">
                                            <span className="w-1.5 h-1.5 bg-[#14b8a6] rounded-full"></span>
                                            NOVA RESPOSTA
                                        </span>
                                    )}
                                </div>
                                <h4 className={`text-base truncate transition-colors ${feedback.has_unread_user ? 'font-bold text-slate-900' : 'font-medium text-slate-700 group-hover:text-[#14b8a6]'}`}>
                                    {feedback.subject}
                                </h4>
                                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                                    Atualizado em {formatToSP(feedback.last_activity_at)}
                                </p>
                            </div>
                            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                                <span className={`px-3 py-1 text-xs font-semibold rounded-lg border ${getStatusStyle(feedback.status)}`}>
                                    {getStatusLabel(feedback.status)}
                                </span>
                                <p className="text-[11px] text-slate-400 font-mono tracking-wide">
                                    #{feedback.id.substring(0, 8)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCreateModal && (
                <CreateFeedbackModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={fetchFeedbacks}
                />
            )}
        </div>
    );
}

export default FeedbackV2;

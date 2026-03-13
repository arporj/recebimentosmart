import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, User, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatToSP } from '../../lib/dates';
import type { Feedback, FeedbackMessage } from '../../types/feedback';
import toast from 'react-hot-toast';

interface FeedbackDetailsV2Props {
    feedback: Feedback;
    onBack: () => void;
    isAdminView?: boolean;
}

export default function FeedbackDetailsV2({ feedback: initialFeedback, onBack, isAdminView = false }: FeedbackDetailsV2Props) {
    const { user } = useAuth();
    const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
    const [messages, setMessages] = useState<FeedbackMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setFeedback(initialFeedback);
    }, [initialFeedback]);

    useEffect(() => {
        fetchMessages();
        markAsRead();

        const subscription = supabase
            .channel(`feedback_details_v2:${feedback.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'feedback_messages',
                filter: `feedback_id=eq.${feedback.id}`
            }, (payload) => {
                const newMsg = payload.new as FeedbackMessage;
                setMessages(prev => [...prev, newMsg]);
                scrollToBottom();
                if (newMsg.sender_id !== user?.id) markAsRead();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'feedbacks',
                filter: `id=eq.${feedback.id}`
            }, (payload) => {
                const updatedFeedback = payload.new as Feedback;
                setFeedback(prev => ({ ...prev, ...updatedFeedback }));
                toast.success(`Status atualizado para ${getStatusLabel(updatedFeedback.status)}`);
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [feedback.id]);

    const fetchMessages = async () => {
        try {
            const { data, error } = await supabase
                .from('feedback_messages')
                .select('*')
                .eq('feedback_id', feedback.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setMessages(data || []);
            scrollToBottom();
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            toast.error('Erro ao carregar mensagens');
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async () => {
        if (!user) return;
        try {
            const updateData = isAdminView ? { has_unread_admin: false } : { has_unread_user: false };
            await supabase.from('feedbacks').update(updateData).eq('id', feedback.id);
        } catch (error) {
            console.error('Erro ao marcar como lido:', error);
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;
        setSending(true);
        try {
            const { error } = await supabase.from('feedback_messages').insert({
                feedback_id: feedback.id,
                sender_id: user.id,
                message: newMessage.trim()
            });
            if (error) throw error;
            setNewMessage('');
            supabase.functions.invoke('send_feedback_email', {
                body: { feedback_id: feedback.id, origin: window.location.origin }
            }).catch(err => console.error('Falha ao enviar notificação de feedback:', err));
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            toast.error('Erro ao enviar mensagem');
        } finally {
            setSending(false);
        }
    };

    const handleUpdateStatus = async (newStatus: string) => {
        if (!isAdminView || updatingStatus) return;
        setUpdatingStatus(true);
        try {
            const { error } = await supabase.from('feedbacks').update({
                status: newStatus,
                last_activity_at: new Date().toISOString()
            }).eq('id', feedback.id);
            if (error) throw error;
            toast.success(`Status atualizado para ${getStatusLabel(newStatus)}`);
            await supabase.from('feedback_messages').insert({
                feedback_id: feedback.id,
                message: `O status do feedback foi alterado para: ${getStatusLabel(newStatus)}`,
                sender_id: null
            });
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            toast.error('Erro ao atualizar status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleReopen = async () => {
        if (updatingStatus) return;
        setUpdatingStatus(true);
        try {
            const { error } = await supabase.from('feedbacks').update({
                status: 'open',
                last_activity_at: new Date().toISOString()
            }).eq('id', feedback.id);
            if (error) throw error;
            toast.success('Feedback reaberto com sucesso');
            await supabase.from('feedback_messages').insert({
                feedback_id: feedback.id,
                sender_id: null,
                message: 'Feedback reaberto pelo usuário.'
            });
        } catch (error) {
            console.error('Erro ao reabrir feedback:', error);
            toast.error('Erro ao reabrir feedback');
        } finally {
            setUpdatingStatus(false);
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-emerald-100 text-emerald-700';
            case 'in_progress': return 'bg-amber-100 text-amber-700';
            case 'resolved': return 'bg-blue-100 text-blue-700';
            case 'closed': return 'bg-slate-200 text-slate-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px] bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in duration-300">
            {/* Header */}
            <div className="bg-slate-50/50 p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl hover:bg-slate-200/80 text-slate-500 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            {feedback.subject}
                            <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${feedback.type === 'Crítica' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                {feedback.type}
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400 font-medium">
                            ID: {feedback.id.slice(0, 8)} • Criado em {formatToSP(feedback.created_at)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isAdminView && (
                        <select
                            value={feedback.status}
                            onChange={(e) => handleUpdateStatus(e.target.value)}
                            disabled={updatingStatus}
                            className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom disabled:opacity-50 transition-all"
                        >
                            <option value="open">Aberto</option>
                            <option value="in_progress">Em Análise</option>
                            <option value="resolved">Resolvido</option>
                            <option value="closed">Fechado</option>
                        </select>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${getStatusColor(feedback.status)}`}>
                        {getStatusLabel(feedback.status)}
                    </span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/30">
                {loading ? (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
                    </div>
                ) : messages.length === 0 ? (
                    <p className="text-center text-slate-400 my-8 font-medium">Nenhuma mensagem ainda.</p>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.sender_id === user?.id;
                        const isSystem = msg.sender_id === null;

                        if (isSystem) {
                            return (
                                <div key={msg.id} className="flex justify-center my-4">
                                    <div className="bg-slate-200 text-slate-600 text-xs px-4 py-1.5 rounded-full font-bold">
                                        {msg.message}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[70%] rounded-2xl p-4 shadow-sm ${isMe
                                        ? 'bg-custom text-white rounded-tr-sm'
                                        : 'bg-white text-slate-800 rounded-tl-sm border border-slate-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1.5">
                                        {!isMe && (
                                            isAdminView ? <User className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3 text-custom" />
                                        )}
                                        <span className={`text-xs font-bold ${isMe ? 'text-white/70' : 'text-slate-400'}`}>
                                            {isMe ? 'Você' : (isAdminView ? 'Usuário' : 'Suporte')}
                                        </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                                    <p className={`text-[10px] mt-2 text-right ${isMe ? 'text-white/60' : 'text-slate-300'}`}>
                                        {formatToSP(msg.created_at, 'dd/MM HH:mm')}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100">
                {(feedback.status === 'closed' || feedback.status === 'resolved') && !isAdminView ? (
                    <div className="flex justify-center">
                        <button
                            onClick={handleReopen}
                            disabled={updatingStatus}
                            className="px-5 py-2.5 bg-white border-2 border-custom text-custom rounded-xl hover:bg-custom/5 font-bold transition-all shadow-sm"
                        >
                            Reabrir Chamado para Responder
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSendMessage} className="flex gap-3">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Digite sua mensagem..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 placeholder:text-slate-400 transition-all"
                            disabled={sending}
                        />
                        <button
                            type="submit"
                            disabled={sending || !newMessage.trim()}
                            className="bg-custom text-white p-3 rounded-xl hover:bg-custom-hover disabled:opacity-50 transition-all shadow-sm"
                        >
                            <Send className="h-5 w-5" />
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

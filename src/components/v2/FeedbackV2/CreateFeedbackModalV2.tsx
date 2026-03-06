import React, { useState } from 'react';
import { X, CheckCircle, ChevronDown, ChevronUp, MessageSquarePlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

interface CreateFeedbackModalV2Props {
    onClose: () => void;
    onSuccess: () => void;
}

export function CreateFeedbackModalV2({ onClose, onSuccess }: CreateFeedbackModalV2Props) {
    const { user } = useAuth();
    const [type, setType] = useState<'Crítica' | 'Sugestão'>('Sugestão');
    const [subject, setSubject] = useState('');
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!subject.trim()) {
            toast.error('Por favor, informe um assunto');
            return;
        }

        if (!comment.trim()) {
            toast.error('Por favor, escreva seu comentário');
            return;
        }

        setLoading(true);

        try {
            if (!user) throw new Error('Usuário não autenticado');

            // 1. Criar o feedback
            const { data: feedback, error: feedbackError } = await supabase
                .from('feedbacks')
                .insert({
                    user_id: user.id,
                    type: type,
                    subject: subject,
                    status: 'open',
                    has_unread_admin: true,
                    has_unread_user: false
                })
                .select()
                .single();

            if (feedbackError) throw feedbackError;

            // 2. Criar a primeira mensagem
            const { error: messageError } = await supabase
                .from('feedback_messages')
                .insert({
                    feedback_id: feedback.id,
                    sender_id: user.id,
                    message: comment
                });

            if (messageError) throw messageError;

            // 3. Enviar notificação por email (Edge Function)
            supabase.functions.invoke('send_feedback_email', {
                body: {
                    feedback_id: feedback.id,
                    origin: window.location.origin
                }
            }).catch(err => console.error('Falha ao enviar notificação de feedback:', err));

            toast.success('Seu feedback foi enviado com sucesso!');
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Erro ao enviar feedback:', error);
            toast.error('Erro ao enviar feedback: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div
                className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full relative shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-[#14b8a6]/10 text-[#14b8a6] p-3 rounded-2xl flex-shrink-0">
                        <MessageSquarePlus className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Novo Feedback</h2>
                        <p className="text-slate-500 text-sm mt-1 font-medium">Nos ajude a melhorar sua experiência</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">O que você deseja relatar?</p>
                        <div className="relative">
                            <button
                                type="button"
                                className="w-full flex items-center justify-between px-4 py-2 border border-slate-300 rounded-xl bg-white text-left focus:outline-none focus:ring-2 focus:ring-custom h-14 text-base font-medium transition-all"
                                onClick={() => setShowDropdown(!showDropdown)}
                            >
                                <span className={type === 'Crítica' ? 'text-red-600' : 'text-purple-600'}>{type}</span>
                                {showDropdown ? (
                                    <ChevronUp className="h-5 w-5 text-slate-400" />
                                ) : (
                                    <ChevronDown className="h-5 w-5 text-slate-400" />
                                )}
                            </button>

                            {showDropdown && (
                                <div className="absolute z-10 mt-2 w-full bg-white shadow-xl rounded-xl border border-slate-200 overflow-hidden">
                                    <ul>
                                        <li
                                            className="px-5 py-3 hover:bg-slate-50 cursor-pointer text-purple-600 font-medium transition-colors"
                                            onClick={() => {
                                                setType('Sugestão');
                                                setShowDropdown(false);
                                            }}
                                        >
                                            Sugestão
                                        </li>
                                        <li
                                            className="px-5 py-3 hover:bg-slate-50 cursor-pointer text-red-600 font-medium transition-colors"
                                            onClick={() => {
                                                setType('Crítica');
                                                setShowDropdown(false);
                                            }}
                                        >
                                            Crítica
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    </label>

                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Assunto resumido</p>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="flex w-full rounded-xl text-slate-900 border border-slate-300 bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 px-4 text-base font-normal transition-all"
                            placeholder="Ex: Melhoria na tela de pagamentos"
                            required
                        />
                    </label>

                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Sua mensagem detalhada</p>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={4}
                            className="flex w-full rounded-xl text-slate-900 border border-slate-300 bg-white focus:ring-2 focus:ring-custom focus:border-custom placeholder:text-slate-400 p-4 text-base font-normal transition-all resize-none"
                            placeholder="Descreva aqui o que você gostaria de nos dizer..."
                            required
                        />
                    </label>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CheckCircle className="h-5 w-5 mr-1" />
                                    Enviar Feedback
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { 
    FlaskConical, Users, Mail, CalendarCheck, AlertTriangle, 
    Trash2, Play, Terminal, ChevronRight, CheckCircle, ShieldAlert,
    Search, ChevronDown, CreditCard, UserCheck
} from 'lucide-react';

const removeAccents = (str: string): string => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

interface UserSelectOption {
    id: string;
    name: string | null;
    email: string;
    plan_name: string | null;
    subscription_status: string | null;
}

interface ClientSelectOption {
    id: string;
    name: string;
    email: string | null;
}

interface LogEntry {
    timestamp: string;
    type: 'info' | 'success' | 'error' | 'warning';
    message: string;
    details?: any;
}

export default function AdminSystemTestsV2() {
    const { user: adminUser } = useAuth();
    const [users, setUsers] = useState<UserSelectOption[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [userClients, setUserClients] = useState<ClientSelectOption[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [loadingClients, setLoadingClients] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [executing, setExecuting] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Efeito para fechar o dropdown ao clicar fora
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    
    // Logs de execução (estilo terminal)
    const [logs, setLogs] = useState<LogEntry[]>([
        {
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: 'Terminal de Testes do Sistema inicializado. Aguardando comandos...'
        }
    ]);

    useEffect(() => {
        const fetchUsers = async () => {
            setLoadingUsers(true);
            try {
                const { data, error } = await supabase.rpc('get_all_users_admin');
                if (error) throw error;
                
                // Ordenar usuários em ordem alfabética de forma nativa e insensível a acentos
                const sortedData = (data || []).sort((a, b) => {
                    const nameA = a.name || a.email || '';
                    const nameB = b.name || b.email || '';
                    return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
                });
                
                setUsers(sortedData);
                if (sortedData.length > 0) {
                    setSelectedUserId(sortedData[0].id);
                }
            } catch (error: any) {
                console.error('Erro ao carregar usuários:', error);
                addLog('error', 'Falha ao carregar lista de usuários para seleção.', error.message);
                toast.error('Erro ao carregar usuários.');
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, []);

    // Buscar clientes do usuário selecionado
    useEffect(() => {
        if (!selectedUserId) {
            setUserClients([]);
            setSelectedClientId('');
            return;
        }
        const fetchUserClients = async () => {
            setLoadingClients(true);
            try {
                const { data, error } = await supabase
                    .from('clients')
                    .select('id, name, email')
                    .eq('user_id', selectedUserId)
                    .is('deleted_at', null)
                    .order('name', { ascending: true });

                if (error) throw error;
                setUserClients(data || []);
                if (data && data.length > 0) {
                    setSelectedClientId(data[0].id);
                } else {
                    setSelectedClientId('');
                }
            } catch (err: any) {
                console.error('Erro ao carregar clientes do usuário:', err);
                setUserClients([]);
                setSelectedClientId('');
            } finally {
                setLoadingClients(false);
            }
        };
        fetchUserClients();
    }, [selectedUserId]);

    const addLog = (type: 'info' | 'success' | 'error' | 'warning', message: string, details?: any) => {
        const newEntry: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            details
        };
        setLogs(prev => [newEntry, ...prev]);
    };

    const clearLogs = () => {
        setLogs([
            {
                timestamp: new Date().toLocaleTimeString(),
                type: 'info',
                message: 'Terminal limpo. Aguardando novos disparos...'
            }
        ]);
    };

    const getSelectedUser = () => {
        return users.find(u => u.id === selectedUserId);
    };

    // 1. Notificação Semanal / Fila Completa (antigo botão de Mail da tabela)
    const handleNotifyDuePayments = async () => {
        const selUser = getSelectedUser();
        if (!selUser) {
            toast.error('Por favor, selecione um usuário primeiro.');
            return;
        }

        setExecuting(true);
        addLog('info', `Iniciando invocação da Edge Function para notificar vencimentos do usuário ${selUser.name || selUser.email}...`);
        const toastId = toast.loading('Invocando notificação de vencimentos...');
        
        try {
            const { data, error } = await supabase.functions.invoke('notify-due-clients', { 
                body: { 
                    userId: selUser.id, 
                    targetEmail: 'andre@andreric.com' 
                } 
            });
            
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            addLog('success', `Invocação concluída! Notificação em lote enviada na fila para ${selUser.email}.`, data);
            toast.success('E-mail enviado com sucesso!', { id: toastId });
        } catch (error: any) {
            console.error('Erro:', error);
            addLog('error', `Erro na execução: ${error.message || 'Erro inesperado'}`, error);
            toast.error('Erro ao enviar e-mail. Verifique o terminal de logs.', { id: toastId });
        } finally {
            setExecuting(false);
        }
    };

    // 2. Testar E-mail de Contas Hoje (antigo botão de CalendarCheck da tabela)
    const handleTestTodayNotification = async () => {
        const selUser = getSelectedUser();
        if (!selUser) {
            toast.error('Por favor, selecione um usuário primeiro.');
            return;
        }

        setExecuting(true);
        addLog('info', `Invocando RPC de teste de contas de HOJE do usuário ${selUser.name || selUser.email}...`);
        const toastId = toast.loading('Disparando e-mail de teste (contas hoje)...');
        
        try {
            const { data: responseData, error } = await supabase.rpc('process_due_accounts_notification_test', { p_user_id: selUser.id });
            if (error) throw error;
            
            const res = responseData as any;
            if (res?.success) {
                addLog('success', `RPC processada! E-mail de contas de hoje enviado para andre@andreric.com.`, res);
                toast.success(res.message || 'E-mail de teste enviado!', { id: toastId });
            } else {
                addLog('warning', `RPC retornou aviso: ${res?.error || 'Nenhum lançamento pendente para hoje.'}`, res);
                toast.error(res?.error || 'Nenhum lançamento hoje.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Erro:', error);
            addLog('error', `Erro na RPC process_due_accounts_notification_test: ${error.message || 'Erro inesperado'}`, error);
            toast.error('Erro ao disparar teste.', { id: toastId });
        } finally {
            setExecuting(false);
        }
    };

    // 2.1. Testar E-mail de Fechamento de Fatura do Cartão
    const handleTestCardInvoiceNotification = async () => {
        const selUser = getSelectedUser();
        if (!selUser) {
            toast.error('Por favor, selecione um usuário primeiro.');
            return;
        }

        setExecuting(true);
        addLog('info', `Invocando RPC de teste de fechamento de fatura de cartão do usuário ${selUser.name || selUser.email}...`);
        const toastId = toast.loading('Disparando e-mail de teste (fechamento de fatura)...');
        
        try {
            const { data: responseData, error } = await supabase.rpc('process_card_invoice_notification_test', { p_user_id: selUser.id });
            if (error) throw error;
            
            const res = responseData as any;
            if (res?.success) {
                addLog('success', `RPC processada! E-mail de fechamento de fatura enviado para andre@andreric.com.`, res);
                toast.success(res.message || 'E-mail de teste enviado!', { id: toastId });
            } else {
                addLog('warning', `RPC retornou aviso: ${res?.error || 'Nenhum cartão com gastos no mês atual.'}`, res);
                toast.error(res?.error || 'Nenhum cartão com gastos.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Erro:', error);
            addLog('error', `Erro na RPC process_card_invoice_notification_test: ${error.message || 'Erro inesperado'}`, error);
            toast.error('Erro ao disparar teste.', { id: toastId });
        } finally {
            setExecuting(false);
        }
    };

    // 2.2. Testar Notificação de Cobrança ao Cliente (envia cópia para o admin)
    const handleTestClientNotification = async () => {
        const selUser = getSelectedUser();
        if (!selUser) {
            toast.error('Por favor, selecione um usuário primeiro.');
            return;
        }

        setExecuting(true);
        addLog('info', `Invocando Edge Function send-client-notification-manual para notificação de cliente do usuário ${selUser.name || selUser.email}...`);
        const toastId = toast.loading('Disparando e-mail de teste (Notificação do Cliente)...');
        
        try {
            const targetClientId = selectedClientId || (userClients.length > 0 ? userClients[0].id : '00000000-0000-0000-0000-000000000000');

            const { data, error } = await supabase.functions.invoke('send-client-notification-manual', {
                body: { 
                    userId: selUser.id,
                    user_id: selUser.id,
                    clientId: targetClientId,
                    client_id: targetClientId,
                    targetEmail: 'andre@andreric.com',
                    target_email: 'andre@andreric.com',
                    isTest: true,
                    is_test: true
                } 
            });
            
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            addLog('success', `E-mail de notificação de cobrança do cliente enviado com sucesso para ${data.sentTo || 'andre@andreric.com'}!`, data);
            toast.success(data.message || 'E-mail de teste enviado para andre@andreric.com!', { id: toastId });
        } catch (error: any) {
            console.error('Erro:', error);
            addLog('error', `Erro ao invocar send-client-notification-manual: ${error.message || 'Erro inesperado'}`, error);
            toast.error(`Erro ao disparar teste: ${error.message || 'Falha na função'}`, { id: toastId });
        } finally {
            setExecuting(false);
        }
    };

    // 3. Simular e-mails da Régua de Retenção (LGPD)
    const handleTestRetentionEmail = async (days: number) => {
        const selUser = getSelectedUser();
        if (!selUser) {
            toast.error('Por favor, selecione um usuário primeiro.');
            return;
        }

        setExecuting(true);
        
        let label = '';
        if (days === 30) label = '30 dias (Sentimos sua falta)';
        else if (days === 60) label = '60 dias (Aviso de exclusão em 30 dias)';
        else if (days === 89) label = '89 dias (Último aviso: exclusão amanhã)';
        else if (days === 90) label = '90 dias (Purga e exclusão física definitiva)';

        addLog('info', `Simulando estágio de retenção de ${label} para o usuário ${selUser.name || selUser.email}...`);
        const toastId = toast.loading(`Disparando simulação de ${days} dias...`);
        
        try {
            const { data: responseData, error } = await supabase.rpc('process_expired_accounts_retention_test', {
                p_user_id: selUser.id,
                p_days_expired: days
            });
            if (error) throw error;
            
            const res = responseData as any;
            if (res?.success) {
                if (days === 90) {
                    addLog('warning', `[AÇÃO DE 90 DIAS] Simulação concluída com êxito!`, {
                        explicacao: 'O estágio de 90 dias não envia e-mail comercial. Sua ação é a eliminação definitiva física do usuário e purga por CASCADE.',
                        acao_simulada: `DELETE FROM auth.users WHERE id = '${selUser.id}'`,
                        retorno: res.message
                    });
                    toast.success('Simulação de exclusão concluída (ver console de logs)!', { id: toastId });
                } else {
                    addLog('success', `E-mail de retenção (${days} dias) enviado com sucesso para andre@andreric.com!`, res);
                    toast.success(res.message || 'E-mail de teste enviado!', { id: toastId });
                }
            } else {
                addLog('error', `A simulação retornou erro: ${res?.error || 'Erro inesperado'}`, res);
                toast.error(res?.error || 'Erro na simulação.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Erro:', error);
            addLog('error', `Erro na RPC process_expired_accounts_retention_test: ${error.message || 'Erro inesperado'}`, error);
            toast.error('Falha ao rodar simulação de e-mail.', { id: toastId });
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex items-start gap-4 mt-8">
                <div className="p-3 bg-custom/10 rounded-xl text-custom border border-custom/20">
                    <FlaskConical className="w-8 h-8 animate-pulse" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">TESTES DO SISTEMA (ÁREA ADMIN)</h2>
                    <p className="text-slate-500 mt-0.5">
                        Simule o comportamento de disparos de e-mail, alertas financeiros e exclusão automática de dados da LGPD.
                    </p>
                </div>
            </div>

            {/* Aviso Premium */}
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3 shadow-sm">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-bold text-slate-900">Ambiente de Auditoria e Teste Seguro</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed font-medium">
                        Todas as ações de e-mail disparadas por esta tela serão canalizadas exclusivamente para o e-mail administrativo principal do sistema (<strong>andre@andreric.com</strong>). O usuário selecionado abaixo servirá como a **fonte dos dados cadastrados e financeiros** (como faturas pendentes, nome no cabeçalho e limites do plano).
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Lado Esquerdo: Configuração e Ações */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Card 1: Seleção do Usuário Fonte */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-900">1. Selecionar Usuário de Dados</h3>
                                <p className="text-[10px] text-slate-400 font-medium">Filtre por digitação e selecione o usuário desejado</p>
                            </div>
                        </div>

                        {loadingUsers ? (
                            <div className="text-xs font-semibold text-slate-400 animate-pulse">Carregando usuários cadastrados...</div>
                        ) : (
                            <div className="relative" ref={dropdownRef}>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                    Usuário Selecionado
                                </label>
                                
                                {/* Botão Principal do Dropdown */}
                                <button
                                    type="button"
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold text-slate-900 transition-all focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none shadow-sm"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-1.5 bg-slate-200/60 rounded-lg text-slate-600 shrink-0">
                                            <Users className="w-4 h-4" />
                                        </div>
                                        {getSelectedUser() ? (
                                            <div className="text-left min-w-0">
                                                <p className="text-sm font-bold text-slate-800 leading-tight truncate">
                                                    {getSelectedUser()?.name || 'Sem Nome'}
                                                </p>
                                                <p className="text-xs text-slate-500 font-medium leading-none mt-1 truncate">
                                                    {getSelectedUser()?.email}
                                                </p>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 font-medium">Nenhum usuário selecionado</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        {getSelectedUser()?.plan_name && (
                                            <span className="hidden sm:inline-block px-2.5 py-1 text-[10px] font-black tracking-wider uppercase bg-custom/10 text-custom rounded-full">
                                                {getSelectedUser()?.plan_name}
                                            </span>
                                        )}
                                        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                                    </div>
                                </button>

                                {/* Dropdown Menu */}
                                {isDropdownOpen && (
                                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                                        
                                        {/* Barra de Busca dentro do Dropdown */}
                                        <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                            <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                            <input
                                                type="text"
                                                placeholder="Digite o nome ou e-mail para buscar..."
                                                value={userSearchTerm}
                                                onChange={(e) => setUserSearchTerm(e.target.value)}
                                                className="w-full bg-transparent text-xs font-semibold text-slate-800 outline-none border-none placeholder-slate-400 focus:ring-0"
                                                autoFocus
                                            />
                                            {userSearchTerm && (
                                                <button
                                                    onClick={() => setUserSearchTerm('')}
                                                    type="button"
                                                    className="text-[10px] font-extrabold text-slate-400 hover:text-slate-600 transition-colors uppercase shrink-0"
                                                >
                                                    Limpar
                                                </button>
                                            )}
                                        </div>

                                        {/* Lista de Usuários */}
                                        <div className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-50 custom-scrollbar">
                                            {users.filter(u => {
                                                const term = removeAccents(userSearchTerm.toLowerCase());
                                                const nameNormalized = removeAccents((u.name || '').toLowerCase());
                                                const emailNormalized = removeAccents((u.email || '').toLowerCase());
                                                return nameNormalized.includes(term) || emailNormalized.includes(term);
                                            }).length === 0 ? (
                                                <div className="px-4 py-6 text-center text-xs font-semibold text-slate-400">
                                                    Nenhum usuário correspondente encontrado
                                                </div>
                                            ) : (
                                                users
                                                    .filter(u => {
                                                        const term = removeAccents(userSearchTerm.toLowerCase());
                                                        const nameNormalized = removeAccents((u.name || '').toLowerCase());
                                                        const emailNormalized = removeAccents((u.email || '').toLowerCase());
                                                        return nameNormalized.includes(term) || emailNormalized.includes(term);
                                                    })
                                                    .map((u) => {
                                                        const isSelected = u.id === selectedUserId;
                                                        return (
                                                            <button
                                                                key={u.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedUserId(u.id);
                                                                    setIsDropdownOpen(false);
                                                                    setUserSearchTerm('');
                                                                }}
                                                                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-all ${
                                                                    isSelected 
                                                                        ? 'bg-custom/5 border-l-4 border-custom pl-3' 
                                                                        : 'hover:bg-slate-50 border-l-4 border-transparent pl-3'
                                                                }`}
                                                            >
                                                                <div className="min-w-0 pr-2">
                                                                    <p className={`text-xs font-bold truncate ${isSelected ? 'text-custom' : 'text-slate-800'}`}>
                                                                        {u.name || 'Sem Nome'}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                                                        {u.email}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {u.plan_name && (
                                                                        <span className={`px-2 py-0.5 text-[8px] font-black tracking-wider uppercase rounded-full ${
                                                                            isSelected 
                                                                                ? 'bg-custom/10 text-custom' 
                                                                                : 'bg-slate-100 text-slate-500'
                                                                        }`}>
                                                                            {u.plan_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Seleção do Cliente do Usuário */}
                        <div className="pt-3 border-t border-slate-100 space-y-1.5">
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                Cliente do Usuário (para Notificação de Cobrança)
                            </label>
                            {loadingClients ? (
                                <div className="text-xs font-semibold text-slate-400 animate-pulse py-2">Carregando clientes do usuário...</div>
                            ) : (
                                <select
                                    value={selectedClientId}
                                    onChange={(e) => setSelectedClientId(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-800 transition-all focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none shadow-sm cursor-pointer"
                                >
                                    {userClients.length === 0 ? (
                                        <option value="">Nenhum cliente cadastrado (usará dados simulados de teste)</option>
                                    ) : (
                                        <>
                                            <option value="">Automático (Primeiro cliente com pendências)</option>
                                            {userClients.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} {c.email ? `(${c.email})` : '(sem e-mail)'}
                                                </option>
                                            ))}
                                        </>
                                    )}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Grid de Disparos de E-mail */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Seção 1: Notificações de Vencimento */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5 flex flex-col justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                        <CalendarCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-sm text-slate-900">Alertas de Vencimentos</h3>
                                        <p className="text-[10px] text-slate-400 font-medium">Contas e faturas pendentes do extrato</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                    Dispare alertas financeiros em lote ou teste a renderização de faturas agendadas para o dia de hoje.
                                </p>
                            </div>

                            <div className="space-y-2.5 pt-4">
                                <button
                                    onClick={handleTestTodayNotification}
                                    disabled={executing || loadingUsers}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all disabled:opacity-50"
                                >
                                    <span>Testar E-mail de Contas Hoje</span>
                                    <Play className="w-4 h-4 text-emerald-500" />
                                </button>
                                <button
                                    onClick={handleTestCardInvoiceNotification}
                                    disabled={executing || loadingUsers}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all disabled:opacity-50"
                                >
                                    <span>Testar Fechamento de Fatura de Cartão</span>
                                    <CreditCard className="w-4 h-4 text-indigo-500" />
                                </button>
                                <button
                                    onClick={handleTestClientNotification}
                                    disabled={executing || loadingUsers}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all disabled:opacity-50"
                                >
                                    <span>Testar Notificação de Cobrança ao Cliente</span>
                                    <UserCheck className="w-4 h-4 text-teal-600" />
                                </button>
                                <button
                                    onClick={handleNotifyDuePayments}
                                    disabled={executing || loadingUsers}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all disabled:opacity-50"
                                >
                                    <span>Disparar Fila Semanal (Lote)</span>
                                    <Mail className="w-4 h-4 text-custom" />
                                </button>
                            </div>
                        </div>

                        {/* Seção 2: Régua de Retenção LGPD */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5 flex flex-col justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                        <ShieldAlert className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-sm text-slate-900">Régua de Retenção LGPD</h3>
                                        <p className="text-[10px] text-slate-400 font-medium">Ciclo de descarte de contas expiradas</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                    Dispare cada e-mail da régua de privacidade LGPD ou simule a purga e limpeza de 90 dias.
                                </p>
                            </div>

                            <div className="space-y-2 pt-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleTestRetentionEmail(30)}
                                        disabled={executing || loadingUsers}
                                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 transition-all disabled:opacity-50"
                                        title="Estágio 1: Sumido (30 dias)"
                                    >
                                        Simular 30 Dias
                                    </button>
                                    <button
                                        onClick={() => handleTestRetentionEmail(60)}
                                        disabled={executing || loadingUsers}
                                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 transition-all disabled:opacity-50"
                                        title="Estágio 2: Aviso de Exclusão (60 dias)"
                                    >
                                        Simular 60 Dias
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleTestRetentionEmail(89)}
                                        disabled={executing || loadingUsers}
                                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 transition-all disabled:opacity-50"
                                        title="Estágio 3: Último Aviso Urgente (89 dias)"
                                    >
                                        Simular 89 Dias
                                    </button>
                                    <button
                                        onClick={() => handleTestRetentionEmail(90)}
                                        disabled={executing || loadingUsers}
                                        className="py-2.5 px-3 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl text-[10px] font-extrabold text-red-600 transition-all disabled:opacity-50"
                                        title="Estágio 4: Purga e Limpeza total (90 dias)"
                                    >
                                        Simular 90 Dias
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Lado Direito: Terminal de Logs da API */}
                <div className="lg:col-span-1 flex flex-col h-[480px]">
                    <div className="bg-slate-900 rounded-2xl flex-1 flex flex-col overflow-hidden border border-slate-800 shadow-2xl">
                        
                        {/* Terminal Header */}
                        <div className="bg-slate-950 px-4 py-3.5 border-b border-slate-800/80 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-black text-slate-300 uppercase tracking-widest font-mono">LOGS DO SERVIDOR</span>
                            </div>
                            <button
                                onClick={clearLogs}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase transition-colors"
                            >
                                Limpar
                            </button>
                        </div>

                        {/* Terminal Content */}
                        <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-[11px] leading-relaxed custom-scrollbar bg-slate-950/40">
                            {logs.map((log, index) => (
                                <div key={index} className="space-y-1 animate-in fade-in duration-200">
                                    <div className="flex items-start gap-1.5">
                                        <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                                        <span className={`shrink-0 select-none font-bold ${
                                            log.type === 'success' ? 'text-emerald-500' :
                                            log.type === 'error' ? 'text-red-500' :
                                            log.type === 'warning' ? 'text-amber-500' : 'text-blue-400'
                                        }`}>
                                            {log.type.toUpperCase()}:
                                        </span>
                                        <span className="text-slate-300">{log.message}</span>
                                    </div>
                                    {log.details && (
                                        <pre className="text-[10px] text-slate-500 bg-slate-950 p-2 rounded-lg border border-slate-900 overflow-x-auto whitespace-pre">
                                            {JSON.stringify(log.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

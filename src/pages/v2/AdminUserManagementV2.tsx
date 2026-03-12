import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    Users, UserPlus, CheckCircle, Search,
    ArrowUp, ArrowDown, MoreVertical, Mail, TrendingUp
} from 'lucide-react';
import UserDetailsModalV2 from '../../components/v2/UserDetailsModalV2';
import { UserProfile } from '../../components/admin/UserTable';

interface KpiData {
    monthlyRevenue: number;
    activeUsers: number;
    newUsers: number;
    convertedTrials: number;
}

const PlanBadge: React.FC<{ plan: string | null }> = ({ plan }) => {
    if (!plan) return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Nenhum</span>;
    const planLower = plan.toLowerCase();

    if (planLower === 'trial') {
        return <span className="bg-purple-100 text-purple-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Trial</span>;
    } else if (planLower === 'pro' || planLower === 'premium' || planLower === 'pró') {
        return <span className="bg-custom/10 text-custom text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">{plan}</span>;
    } else if (planLower === 'basico' || planLower === 'básico') {
        return <span className="bg-blue-100 text-blue-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Básico</span>;
    }
    return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">{plan}</span>;
};

const StatusBadge: React.FC<{ status: string | null, isAdmin: boolean }> = ({ status, isAdmin }) => {
    if (isAdmin) return <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Admin</span>;
    if (!status) return <span className="bg-slate-200 text-slate-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">-</span>;

    const statusLower = status.toLowerCase();
    if (statusLower === 'active' || statusLower === 'ativo') {
        return <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Ativo</span>;
    } else if (statusLower === 'inactive' || statusLower === 'inativo') {
        return <span className="bg-red-100 text-red-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Inativo</span>;
    } else if (statusLower === 'pending' || statusLower === 'pendente') {
        return <span className="bg-amber-100 text-amber-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Pendente</span>;
    }
    return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">{status}</span>;
};

export default function AdminUserManagementV2() {
    const [kpiData, setKpiData] = useState<KpiData | null>(null);
    const [loadingKpis, setLoadingKpis] = useState(true);

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [sortField, setSortField] = useState<string>('last_sign_in_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 10;

    useEffect(() => {
        fetchKpis();
        fetchUsers();
    }, []);

    const fetchKpis = async () => {
        setLoadingKpis(true);
        try {
            const { data, error } = await supabase.rpc('get_admin_dashboard_kpis');
            if (error) throw error;
            setKpiData(data);
        } catch (error) {
            console.error('Erro ao buscar KPIs:', error);
            toast.error('Falha ao carregar as métricas do dashboard.');
        } finally {
            setLoadingKpis(false);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const { data, error } = await supabase.rpc('get_all_users_admin');
            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            toast.error('Erro ao carregar usuários');
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const sortedUsers = [...users].sort((a, b) => {
        const aValue = a[sortField as keyof UserProfile];
        const bValue = b[sortField as keyof UserProfile];

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue === null) return sortDirection === 'asc' ? -1 : 1;

        let res = 0;
        if (['created_at', 'last_sign_in_at', 'valid_until', 'subscription_end_date'].includes(sortField)) {
            res = new Date(aValue as string).getTime() - new Date(bValue as string).getTime();
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
            res = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
            res = (aValue === bValue) ? 0 : aValue ? -1 : 1;
        } else {
            if (aValue < bValue) res = -1;
            else if (aValue > bValue) res = 1;
        }
        return sortDirection === 'asc' ? res : -res;
    });

    const filteredUsers = sortedUsers.filter(user => {
        const search = searchTerm.toLowerCase();
        return (
            (user.name?.toLowerCase().includes(search) || false) ||
            user.email.toLowerCase().includes(search) ||
            (user.plan_name?.toLowerCase().includes(search) || false)
        );
    });

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const currentUsers = filteredUsers.slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage);

    const getSortIcon = (field: string) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc'
            ? <ArrowUp className="h-4 w-4 inline-block ml-1" />
            : <ArrowDown className="h-4 w-4 inline-block ml-1" />;
    };

    const getInitials = (name: string | null, email: string) => {
        if (name) {
            const parts = name.split(' ');
            if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
            return name.substring(0, 2).toUpperCase();
        }
        return email.substring(0, 2).toUpperCase();
    };

    const handleNotifyDuePayments = async (user: UserProfile) => {
        if (!window.confirm(`Deseja enviar o e-mail de notificação de vencimentos para ${user.name || user.email}?`)) return;
        const toastId = toast.loading('Enviando notificação...');
        try {
            const { data, error } = await supabase.functions.invoke('notify-due-clients', { body: { userId: user.id } });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            toast.success('E-mail enviado com sucesso!', { id: toastId });
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            toast.error('Erro ao enviar e-mail. Verifique o console.', { id: toastId });
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-custom/10 rounded-xl text-custom">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gerenciamento de Usuários</h2>
                        <p className="text-slate-500">Administre todos os usuários da plataforma, e acompanhe o crescimento.</p>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Receita do Mês</p>
                        <p className="text-2xl font-black text-slate-900">
                            {loadingKpis ? '...' : `R$ ${kpiData?.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Usuários Ativos</p>
                        <p className="text-2xl font-black text-slate-900">
                            {loadingKpis ? '...' : kpiData?.activeUsers.toString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                            <UserPlus className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Novos Usuários (30d)</p>
                        <p className="text-2xl font-black text-slate-900">
                            {loadingKpis ? '...' : kpiData?.newUsers.toString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Conversões de Trial</p>
                        <p className="text-2xl font-black text-slate-900">
                            {loadingKpis ? '...' : kpiData?.convertedTrials.toString()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Search and Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <div className="relative max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 outline-none transition-all placeholder:text-slate-400"
                            placeholder="Pesquisar usuários por nome, email ou plano..."
                            type="text"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 uppercase text-xs font-bold tracking-wider">
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                                    Usuário {getSortIcon('name')}
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('plan_name')}>
                                    Plano {getSortIcon('plan_name')}
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('subscription_status')}>
                                    Status {getSortIcon('subscription_status')}
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('last_sign_in_at')}>
                                    Último Login {getSortIcon('last_sign_in_at')}
                                </th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingUsers ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
                                            <span className="font-medium">Carregando usuários...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : currentUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">
                                        Nenhum usuário encontrado.
                                    </td>
                                </tr>
                            ) : (
                                currentUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-custom/10 border border-custom/20 flex items-center justify-center font-bold text-custom shrink-0">
                                                    {getInitials(user.name, user.email)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-slate-900">{user.name || 'Sem Nome'}</p>
                                                    <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <PlanBadge plan={user.plan_name} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={user.subscription_status} isAdmin={user.is_admin} />
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                            {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleNotifyDuePayments(user)}
                                                    className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                                                    title="Notificar Vencimentos"
                                                >
                                                    <Mail className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => setSelectedUser(user)}
                                                    className="p-2 text-slate-400 hover:text-custom hover:bg-custom/10 rounded-lg transition-colors"
                                                    title="Configurações"
                                                >
                                                    <MoreVertical className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loadingUsers && filteredUsers.length > 0 && (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-sm text-slate-500 font-medium">
                            Mostrando {(currentPage - 1) * usersPerPage + 1} - {Math.min(currentPage * usersPerPage, filteredUsers.length)} de {filteredUsers.length} usuários
                        </p>
                        <div className="flex gap-2">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="px-3 py-1.5 text-sm font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 disabled:shadow-none transition-all text-slate-700"
                            >
                                Anterior
                            </button>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="px-3 py-1.5 text-sm font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 disabled:shadow-none transition-all text-slate-700"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selectedUser && (
                <UserDetailsModalV2
                    user={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    onUserUpdate={(updatedUser) => {
                        setUsers(users.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
                        fetchUsers();
                    }}
                    onUserDeleted={() => {
                        setSelectedUser(null);
                        fetchUsers();
                    }}
                />
            )}
        </div>
    );
}

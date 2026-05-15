import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DatabaseZap, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  User, 
  Phone,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  Share2,
  X,
  Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ClientStatementModalV2 from '../../components/v2/ClientStatementModalV2';

interface ClientFinancialSummary {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_status: 'active' | 'inactive';
  total_income_pending: number;
  total_expense_pending: number;
  net_balance: number;
  overdue_balance: number;
  pending_transactions_count: number;
  has_recurrence: boolean;
}

export default function RecurrenceV2() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<ClientFinancialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'legacy' | 'migrated'>('all');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'overdue' | 'net-positive' | 'net-negative'>('all');
  
  // Estado do Modal de Extrato
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  // Estado de carregamento atômico por card de importação
  const [importingClientId, setImportingClientId] = useState<string | null>(null);

  // Estados do Modal de Compartilhamento
  const [sharingClient, setSharingClient] = useState<{ id: string; name: string } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [receiverEmail, setReceiverEmail] = useState('');
  const [activeShares, setActiveShares] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [submittingShare, setSubmittingShare] = useState(false);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSummaries();
    }
  }, [user]);

  const fetchSummaries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('client_financial_summary')
        .select('*')
        .order('client_name', { ascending: true });

      if (error) throw error;
      setSummaries(data || []);
    } catch (err) {
      console.error('Erro ao carregar resumos de netting:', err);
      toast.error('Não foi possível carregar as recorrências.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportHistory = async (clientId: string, clientName: string) => {
    if (importingClientId) return;
    
    const confirm = window.confirm(
      `Deseja importar o histórico e gerar as pendências dos últimos 3 meses para "${clientName}" na V2? Essa ação criará a recorrência principal automaticamente.`
    );

    if (!confirm) return;

    try {
      setImportingClientId(clientId);
      
      // Toast de carregamento assíncrono
      const importPromise = supabase.rpc('import_client_history_v1_to_v2', {
        p_client_id: clientId
      }).then(({ data, error }) => {
        if (error) throw error;
        const result = data as any;
        if (!result.success) {
          throw new Error(result.message);
        }
        return result;
      });

      await toast.promise(
        importPromise,
        {
          loading: `Importando dados de ${clientName}...`,
          success: (result) => {
            fetchSummaries(); // Atualiza a listagem de netting na tela
            return `${result.message} (${result.paid_imported} pagos, ${result.pending_generated} atrasados gerados).`;
          },
          error: (err) => `${err.message || 'Erro ao processar importação'}`
        },
        {
          style: {
            minWidth: '250px',
            fontWeight: 'bold',
            fontSize: '14px'
          }
        }
      );
    } catch (err) {
      console.error('Falha na chamada da importação:', err);
    } finally {
      setImportingClientId(null);
    }
  };

  // Filtragem em Memória
  const filteredSummaries = useMemo(() => {
    return summaries.filter(item => {
      // Filtro de Busca
      const nameMatch = item.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (item.client_phone && item.client_phone.includes(searchTerm));
      if (!nameMatch) return false;

      // Filtro de Status do Cliente
      if (statusFilter !== 'all' && item.client_status !== statusFilter) return false;

      // Filtro de Origem (V1 Legacy vs V2)
      if (originFilter === 'legacy' && item.has_recurrence) return false;
      if (originFilter === 'migrated' && !item.has_recurrence) return false;

      // Filtro de Situação Financeira
      if (balanceFilter === 'overdue' && item.overdue_balance <= 0) return false; // Considera atrasado se saldo pendente vencido maior que 0
      if (balanceFilter === 'net-positive' && item.net_balance <= 0) return false;
      if (balanceFilter === 'net-negative' && item.net_balance >= 0) return false;

      return true;
    });
  }, [summaries, searchTerm, statusFilter, originFilter, balanceFilter]);

  // Agregações Globais
  const globalStats = useMemo(() => {
    return summaries.reduce((acc, cur) => {
      acc.totalNetPending += (cur.net_balance || 0);
      acc.totalOverdue += (cur.overdue_balance || 0);
      if (!cur.has_recurrence && cur.client_status === 'active') {
        acc.pendingMigrationCount += 1;
      }
      return acc;
    }, {
      totalNetPending: 0,
      totalOverdue: 0,
      pendingMigrationCount: 0
    });
  }, [summaries]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleOpenStatement = (id: string, name: string) => {
    setSelectedClient({ id, name });
    setIsStatementOpen(true);
  };

  const handleOpenShare = async (id: string, name: string) => {
    setSharingClient({ id, name });
    setIsShareModalOpen(true);
    setReceiverEmail('');
    setRecipientName(null); // Limpa busca anterior
    fetchActiveShares(id);
  };

  const fetchActiveShares = async (clientId: string) => {
    try {
      setLoadingShares(true);
      const { data: shares, error } = await supabase
        .from('client_shares')
        .select('*')
        .eq('client_id', clientId);
      
      if (error) throw error;
      
      if (shares && shares.length > 0) {
        const emails = shares.map((s: any) => s.receiver_email.toLowerCase());
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('name, email')
          .in('email', emails);

        if (!profilesError && profiles) {
          const emailToNameMap = profiles.reduce((acc: any, curr: any) => {
            if (curr.email) {
              acc[curr.email.toLowerCase()] = curr.name;
            }
            return acc;
          }, {});

          const sharesWithNames = shares.map((s: any) => ({
            ...s,
            receiver_name: emailToNameMap[s.receiver_email.toLowerCase()] || null
          }));
          setActiveShares(sharesWithNames);
        } else {
          setActiveShares(shares);
        }
      } else {
        setActiveShares([]);
      }
    } catch (err) {
      console.error('Erro ao buscar compartilhamentos:', err);
      toast.error('Não foi possível listar os compartilhamentos ativos.');
    } finally {
      setLoadingShares(false);
    }
  };

  // Busca automática do nome do destinatário por e-mail
  useEffect(() => {
    const email = receiverEmail.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    if (!isValidEmail) {
      setRecipientName(null);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      try {
        setIsSearchingRecipient(true);
        const { data, error } = await supabase.rpc('get_profile_by_email', {
          email_search: email
        });

        if (error) throw error;

        if (data && data.length > 0) {
          setRecipientName(data[0].name);
        } else {
          setRecipientName(null);
        }
      } catch (err) {
        console.error('Erro ao buscar perfil pelo e-mail:', err);
        setRecipientName(null);
      } finally {
        setIsSearchingRecipient(false);
      }
    }, 500);

    return () => clearTimeout(searchTimeout);
  }, [receiverEmail]);

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingClient || !user) return;
    if (!receiverEmail.trim()) {
      toast.error('Por favor, insira um e-mail válido.');
      return;
    }

    try {
      setSubmittingShare(true);
      
      const { data, error } = await supabase
        .from('client_shares')
        .insert({
          sender_id: user.id,
          client_id: sharingClient.id,
          receiver_email: receiverEmail.trim().toLowerCase(),
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Este cliente já está compartilhado com este e-mail.');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Cliente compartilhado com sucesso!');
      setReceiverEmail('');
      fetchActiveShares(sharingClient.id);

      // Opcional: Enviar e-mail de notificação ao destinatário via Edge Function
      try {
        const userName = user.user_metadata?.name || user.email || 'Um usuário';
        const primaryColor = '#0d9488'; // Teal
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <body style="font-family: sans-serif; color: #333; line-height: 1.6; background: #f9fafb; padding: 20px;">
            <div style="max-width: 500px; margin: auto; background: #fff; padding: 30px; border-radius: 16px; border: 1px solid #e5e7eb;">
              <h2 style="color: ${primaryColor}; font-weight: 800; margin-top: 0;">Resumo Compartilhado com Você!</h2>
              <p>Olá,</p>
              <p><strong>${userName}</strong> acabou de compartilhar o acesso ao extrato financeiro do cliente <strong>${sharingClient.name}</strong> com você no <strong>Recebimento $mart</strong>.</p>
              <div style="background: #f0fdfa; border-left: 4px solid ${primaryColor}; padding: 15px; border-radius: 4px; margin: 20px 0;">
                Acesse o sistema com sua conta para aceitar o convite e começar a visualizar as transações em tempo real.
              </div>
              <a href="https://www.recebimentosmart.com.br/login" style="display: inline-block; background: ${primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">Acessar Sistema</a>
              <p style="font-size: 12px; color: #6b7280; margin-top: 30px;">Equipe Recebimento $mart.</p>
            </div>
          </body>
          </html>
        `;

        supabase.functions.invoke('send-notification-email', {
          body: {
            recipientEmail: receiverEmail.trim().toLowerCase(),
            subject: `Acesso Compartilhado: ${sharingClient.name}`,
            htmlContent: emailHtml
          }
        }).catch(err => console.warn('Falha silenciosa ao enviar e-mail:', err));

      } catch (eMailErr) {
        console.warn('Não foi possível notificar por e-mail:', eMailErr);
      }

    } catch (err) {
      console.error('Erro ao compartilhar cliente:', err);
      toast.error('Erro ao realizar compartilhamento.');
    } finally {
      setSubmittingShare(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!sharingClient) return;
    const confirm = window.confirm('Tem certeza que deseja remover o acesso deste usuário?');
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('client_shares')
        .delete()
        .eq('id', shareId);

      if (error) throw error;
      toast.success('Compartilhamento revogado.');
      fetchActiveShares(sharingClient.id);
    } catch (err) {
      console.error('Erro ao revogar compartilhamento:', err);
      toast.error('Não foi possível remover o compartilhamento.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn pb-10 px-4 sm:px-6">
      
      {/* Header e Painel de Controle */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mt-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
            <div className="bg-teal-50 p-2 rounded-2xl">
              <UserCheck className="text-[#0d9488] w-8 h-8" />
            </div>
            Resumo por Clientes
          </h1>
          <p className="text-slate-500 mt-1 text-xs sm:text-sm font-bold tracking-wide">
            Gestão consolidada de obrigações, receitas e despesas com conciliação automática de fluxos (Netting).
          </p>
        </div>
        
        <button
          onClick={fetchSummaries}
          disabled={loading}
          className="self-start lg:self-center flex items-center gap-2 px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 border border-slate-200 rounded-xl text-xs font-black shadow-sm transition-all"
        >
          <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''}`} />
          Atualizar Dados
        </button>
      </div>

      {/* Resumo de KPIs (Cards Superiores) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Saldo Líquido Pendente Consolidado */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group transition-all hover:shadow-md hover:-translate-y-0.5 duration-300">
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Saldo Líquido Geral</span>
              <h3 className={`text-2xl font-black tracking-tight mt-1 ${
                globalStats.totalNetPending >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {formatCurrency(globalStats.totalNetPending)}
              </h3>
            </div>
            <div className={`p-2.5 rounded-2xl ${
              globalStats.totalNetPending >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {globalStats.totalNetPending >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-bold leading-normal pt-2 border-t border-slate-50">
            Consolidação pendente de todas as receitas menos as despesas cadastradas.
          </p>
        </div>

        {/* Card 2: Valor Vencido em Atraso */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group transition-all hover:shadow-md hover:-translate-y-0.5 duration-300">
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Débitos Vencidos (Atraso)</span>
              <h3 className={`text-2xl font-black tracking-tight mt-1 ${
                globalStats.totalOverdue > 0 ? 'text-rose-600' : 'text-slate-800'
              }`}>
                {formatCurrency(globalStats.totalOverdue)}
              </h3>
            </div>
            <div className={`p-2.5 rounded-2xl ${
              globalStats.totalOverdue > 0 ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'
            }`}>
              <AlertTriangle size={20} className={globalStats.totalOverdue > 0 ? 'animate-pulse' : ''} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-bold leading-normal pt-2 border-t border-slate-50">
            Transações com data de vencimento expirada que ainda constam em aberto.
          </p>
        </div>

        {/* Card 3: Pendentes de Migração da V1 */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl p-5 shadow-md relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 duration-300 text-white">
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200 block">Clientes Legados (V1)</span>
              <h3 className="text-2xl font-black tracking-tight mt-1">
                {globalStats.pendingMigrationCount} Ativo(s)
              </h3>
            </div>
            <div className="p-2.5 bg-white/15 text-white rounded-2xl">
              <DatabaseZap size={20} />
            </div>
          </div>
          <p className="text-[11px] text-indigo-100/80 font-bold leading-normal pt-2 border-t border-white/10 relative z-10">
            Clientes que ainda precisam ter a recorrência mãe criada e histórico migrado.
          </p>
          {/* Fundo com detalhe de design de gradiente circular */}
          <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
        </div>
      </div>

      {/* Filtros e Pesquisa */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Barra de Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Filtrar cliente pelo nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/80 transition-all placeholder-slate-400"
            />
          </div>

          {/* Grid de Filtros Rápidos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
            {/* Status do Cliente */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl select-none">
              <User size={14} className="text-slate-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent border-none text-xs font-black text-slate-600 focus:ring-0 pr-6 py-1 flex-1 cursor-pointer"
              >
                <option value="all">Todos Clientes</option>
                <option value="active">Apenas Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>

            {/* Situação/Origem de Versão */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl select-none">
              <DatabaseZap size={14} className="text-slate-400" />
              <select 
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value as any)}
                className="bg-transparent border-none text-xs font-black text-slate-600 focus:ring-0 pr-6 py-1 flex-1 cursor-pointer"
              >
                <option value="all">Todas Origens</option>
                <option value="legacy">Pendentes Migração</option>
                <option value="migrated">Mapeados V2</option>
              </select>
            </div>

            {/* Tipo de Saldo Consolidado */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl select-none">
              <Filter size={14} className="text-slate-400" />
              <select 
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value as any)}
                className="bg-transparent border-none text-xs font-black text-slate-600 focus:ring-0 pr-6 py-1 flex-1 cursor-pointer"
              >
                <option value="all">Qualquer Saldo</option>
                <option value="overdue">Com Atrasos</option>
                <option value="net-positive">Netting Positivo</option>
                <option value="net-negative">Netting Negativo</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Listagem de Clientes / Grid Cards */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-16 flex flex-col items-center justify-center text-center min-h-[400px] shadow-sm gap-4">
          <div className="w-12 h-12 border-4 border-teal-100 border-t-[#0d9488] rounded-full animate-spin" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Calculando Saldos Financeiros...</span>
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-12 flex flex-col items-center justify-center text-center min-h-[350px] shadow-sm">
          <div className="bg-slate-50 p-5 rounded-full mb-4 border border-slate-100">
            <Search className="w-10 h-10 text-slate-300" />
          </div>
          <h4 className="text-lg font-black text-slate-700 mb-2">Nenhum cliente atende aos filtros</h4>
          <p className="text-sm text-slate-400 max-w-sm font-medium leading-relaxed">
            Tente buscar com termos diferentes ou limpe os filtros de origem e status para ver mais resultados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSummaries.map((cliente) => {
            const isOverdue = cliente.overdue_balance > 0;
            const isPositive = cliente.net_balance >= 0;
            const isV1 = !cliente.has_recurrence;
            const isImporting = importingClientId === cliente.client_id;

            return (
              <div 
                key={cliente.client_id}
                className={`bg-white rounded-[2rem] border p-5 flex flex-col shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 duration-300 group relative overflow-hidden ${
                  isOverdue ? 'border-rose-200/80 bg-rose-50/10' : 'border-slate-200/70'
                }`}
              >
                {/* Destaque Vermelho caso esteja em atraso */}
                {isOverdue && (
                  <div className="absolute top-0 right-0 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl border-l border-b border-rose-700/20 flex items-center gap-1 z-10 shadow-sm animate-pulse">
                    <AlertTriangle size={10} /> Atrasado
                  </div>
                )}

                {/* Header do Card (Avatar + Nome + Tags) */}
                <div className="flex gap-3 mb-4 relative">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black tracking-tight transition-transform group-hover:scale-105 ${
                    cliente.client_status === 'active' 
                      ? 'bg-teal-50 text-[#0d9488]' 
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {getInitials(cliente.client_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black text-slate-800 leading-snug truncate group-hover:text-teal-600 transition-colors" title={cliente.client_name}>
                      {cliente.client_name}
                    </h3>
                    
                    {cliente.client_phone ? (
                      <a 
                        href={`tel:${cliente.client_phone}`}
                        className="flex items-center gap-1 text-slate-400 hover:text-teal-600 font-bold text-xs mt-0.5 transition-colors self-start"
                      >
                        <Phone size={10} />
                        {cliente.client_phone}
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs italic font-medium">Sem telefone</span>
                    )}

                    {/* Badges de Info */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border ${
                        cliente.client_status === 'active'
                          ? 'bg-emerald-50/60 text-emerald-700 border-emerald-200/50'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {cliente.client_status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>

                      {isV1 ? (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                          <DatabaseZap size={10} /> V1
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={10} /> V2 Mapeado
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bloco de Netting Consolidado */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 mb-4 space-y-2 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Saldo Líquido (Netting)</span>
                    <span className={`text-xs font-extrabold rounded px-1.5 py-0.5 border ${
                      isPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {cliente.pending_transactions_count} docs
                    </span>
                  </div>
                  
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-xl font-black tracking-tight font-manrope ${
                      isPositive ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {formatCurrency(cliente.net_balance)}
                    </span>
                  </div>

                  {/* Detalhamento visual (Receitas x Despesas Pendentes) */}
                  <div className="flex items-center gap-4 pt-2 border-t border-slate-200/50 text-xs font-bold">
                    <div className="flex items-center gap-1 text-emerald-600">
                      <ArrowUpRight size={12} />
                      <span>{formatCurrency(cliente.total_income_pending)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-rose-500">
                      <ArrowDownRight size={12} />
                      <span>{formatCurrency(cliente.total_expense_pending)}</span>
                    </div>
                  </div>
                </div>

                {/* Aviso de Atrasado Interno */}
                {isOverdue && (
                  <div className="bg-rose-600/10 rounded-xl border border-rose-200 p-2.5 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <div className="text-[11px] font-bold text-rose-700">
                      Há <span className="font-black">{formatCurrency(cliente.overdue_balance)}</span> já vencidos para este cliente.
                    </div>
                  </div>
                )}

                {/* Bloco de Botões e Ações */}
                <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 mt-auto">
                  
                  {/* Botão de Importação (Aparece apenas para V1) */}
                  {isV1 && (
                    <button
                      onClick={() => handleImportHistory(cliente.client_id, cliente.client_name)}
                      disabled={isImporting}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                        isImporting 
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:shadow-sm active:scale-98'
                      }`}
                    >
                      <DatabaseZap size={14} className={isImporting ? 'animate-pulse' : ''} />
                      {isImporting ? 'Processando Importação...' : 'Importar Histórico V1'}
                    </button>
                  )}

                  {/* Botões Visualizar Extrato Cronológico e Compartilhar */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenStatement(cliente.client_id, cliente.client_name)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-900 active:bg-slate-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                    >
                      <FileText size={14} />
                      Extrato
                    </button>

                    <button
                      onClick={() => handleOpenShare(cliente.client_id, cliente.client_name)}
                      title="Compartilhar acesso ao extrato"
                      className="flex items-center justify-center p-2.5 bg-teal-50 border border-teal-200/80 text-[#0d9488] hover:bg-teal-100 hover:border-teal-300 active:scale-95 rounded-xl transition-all"
                    >
                      <Share2 size={15} />
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Extrato */}
      {selectedClient && (
        <ClientStatementModalV2
          isOpen={isStatementOpen}
          onClose={() => {
            setIsStatementOpen(false);
            // Dá um timeout pequeno para recarregar as métricas em segundo plano caso algo tenha mudado
            fetchSummaries(); 
          }}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
        />
      )}

      {/* Modal de Compartilhamento Premium */}
      {isShareModalOpen && sharingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fadeIn"
            onClick={() => setIsShareModalOpen(false)}
          />

          {/* Card do Modal */}
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative z-10 overflow-hidden animate-slideUp">
            
            {/* Header do Modal */}
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-teal-100/80 p-2 rounded-xl text-[#0d9488]">
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 leading-tight">
                    Compartilhar Extrato
                  </h3>
                  <span className="text-xs font-bold text-teal-700 block mt-0.5 truncate max-w-[240px]">
                    Cliente: {sharingClient.name}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 active:scale-95 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-6">
              
              {/* Formulário de Convite */}
              <form onSubmit={handleShareSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    E-mail do Destinatário
                  </label>
                  <div className="relative">
                    <div className="relative flex items-center">
                      <Mail size={16} className="absolute left-3.5 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="exemplo@email.com"
                        value={receiverEmail}
                        onChange={(e) => setReceiverEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      />
                    </div>
                    
                    {isSearchingRecipient ? (
                      <div className="mt-1.5 text-xs text-teal-600 flex items-center gap-1.5 font-bold animate-pulse">
                        <RefreshCw size={10} className="animate-spin" />
                        Buscando usuário no sistema...
                      </div>
                    ) : recipientName ? (
                      <div className="mt-1.5 text-xs text-teal-600 font-black flex items-center gap-1.5 bg-teal-50/50 p-2 rounded-lg border border-teal-100/50 animate-fadeIn">
                        <CheckCircle2 size={12} className="text-[#0d9488]" />
                        <span>Destinatário encontrado: <strong className="text-[#0f766e]">{recipientName}</strong></span>
                      </div>
                    ) : receiverEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiverEmail.trim()) ? (
                      <div className="mt-1.5 text-xs text-amber-600 font-bold flex items-center gap-1.5 bg-amber-50/50 p-2 rounded-lg border border-amber-100/50 animate-fadeIn">
                        <AlertTriangle size={12} className="text-amber-500" />
                        <span>Este e-mail não possui conta ativa. Um convite será enviado.</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingShare}
                  className="w-full py-2.5 px-4 bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#115e59] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {submittingShare ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Compartilhando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Conceder Acesso
                    </>
                  )}
                </button>
              </form>

              <hr className="border-slate-100" />

              {/* Lista de Compartilhamentos Existentes */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Acessos Concedidos</span>
                  {loadingShares && <RefreshCw size={10} className="animate-spin text-teal-600" />}
                </h4>

                {loadingShares && activeShares.length === 0 ? (
                  <div className="py-8 text-center text-xs font-bold text-slate-400">
                    Carregando acessos...
                  </div>
                ) : activeShares.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center flex flex-col items-center gap-2">
                    <User size={24} className="text-slate-300" />
                    <p className="text-xs font-bold text-slate-400 leading-relaxed">
                      Ninguém além de você tem acesso ao extrato consolidado deste cliente atualmente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                    {activeShares.map((share) => (
                      <div 
                        key={share.id}
                        className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 rounded-xl transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-black text-slate-700 truncate" title={share.receiver_email}>
                            {share.receiver_name || share.receiver_email}
                          </span>
                          {share.receiver_name && (
                            <span className="block text-[10px] text-slate-400 truncate mt-0.5" title={share.receiver_email}>
                              {share.receiver_email}
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                              share.status === 'pending' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                            }`} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                              {share.status === 'pending' ? 'Aguardando aceite' : 'Ativo'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeShare(share.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          title="Revogar acesso"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Rodapé informativo discreto */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[10px] font-bold text-slate-400 leading-normal flex items-center gap-2">
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              <span>O receptor do link poderá visualizar todo o histórico financeiro desse cliente em tempo real.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

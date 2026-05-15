import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Check, 
  X, 
  FileText, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Mail,
  User,
  Shield,
  MessageSquare,
  HelpCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ClientStatementModalV2 from '../../components/v2/ClientStatementModalV2';

interface SharedItem {
  id: string;
  client_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  client: {
    id: string;
    name: string;
    phone: string | null;
  };
  sender: {
    id: string;
    name: string;
    email: string;
  };
  // Agregações financeiras locais calculadas após carregar
  financials?: {
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
  };
}

export default function SharedWithMeV2() {
  const { user } = useAuth();
  const [shares, setShares] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Controle do modal de extrato
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  useEffect(() => {
    if (user?.email) {
      fetchShares();
    }
  }, [user]);

  const fetchShares = async () => {
    try {
      setLoading(true);
      
      // 1. Buscar os compartilhamentos vinculados ao e-mail do usuário logado
      const { data: sharesData, error: sharesError } = await supabase
        .from('client_shares')
        .select(`
          id,
          client_id,
          status,
          created_at,
          client:clients!inner(id, name, phone),
          sender:profiles!client_shares_sender_id_fkey(id, name, email)
        `)
        .eq('receiver_email', user?.email)
        .order('created_at', { ascending: false });

      if (sharesError) throw sharesError;

      let items = (sharesData || []) as any as SharedItem[];

      // Filtra compartilhamentos rejeitados (não exibir na interface de recebidos)
      items = items.filter(item => item.status !== 'rejected');

      // 2. Para itens aceitos, buscar saldo consolidado dinamicamente das transações pendentes
      const acceptedItems = items.filter(item => item.status === 'accepted');
      
      if (acceptedItems.length > 0) {
        const clientIds = acceptedItems.map(item => item.client_id);
        
        // Buscar todas as transações pendentes vinculadas a esses clientes (a RLS vai filtrar corretamente)
        const { data: txData, error: txError } = await supabase
          .from('financial_transactions')
          .select('client_id, type, amount')
          .eq('is_paid', false)
          .in('client_id', clientIds);

        if (!txError && txData) {
          // Processa totais por cliente
          items = items.map(item => {
            if (item.status !== 'accepted') return item;

            const clientTx = txData.filter(t => t.client_id === item.client_id);
            const totalIncome = clientTx
              .filter(t => t.type === 'income')
              .reduce((sum, t) => sum + Number(t.amount), 0);
            const totalExpense = clientTx
              .filter(t => t.type === 'expense')
              .reduce((sum, t) => sum + Number(t.amount), 0);

            return {
              ...item,
              financials: {
                totalIncome,
                totalExpense,
                netBalance: totalIncome - totalExpense
              }
            };
          });
        }
      }

      setShares(items);
    } catch (err) {
      console.error('Erro ao buscar compartilhados:', err);
      toast.error('Falha ao carregar contas compartilhadas.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptShare = async (shareId: string, clientName: string) => {
    try {
      const { error } = await supabase
        .from('client_shares')
        .update({ status: 'accepted' })
        .eq('id', shareId);

      if (error) throw error;

      toast.success(`Você aceitou o compartilhamento de "${clientName}"!`);
      fetchShares();
    } catch (err) {
      console.error('Erro ao aceitar compartilhamento:', err);
      toast.error('Erro ao aceitar convite.');
    }
  };

  const handleRejectShare = async (shareId: string) => {
    const confirmed = window.confirm("Deseja realmente rejeitar e remover este compartilhamento de sua lista?");
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('client_shares')
        .update({ status: 'rejected' })
        .eq('id', shareId);

      if (error) throw error;

      toast.success('Compartilhamento rejeitado com sucesso.');
      fetchShares();
    } catch (err) {
      console.error('Erro ao rejeitar compartilhamento:', err);
      toast.error('Erro ao recusar convite.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const pendingShares = shares.filter(s => s.status === 'pending');
  const acceptedShares = shares.filter(s => s.status === 'accepted');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Topo da página */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Compartilhado Comigo
            </h1>
          </div>
          <p className="text-slate-500 mt-2">
            Acesse resumos e extratos compartilhados por outros parceiros e clientes no sistema.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          <p>Carregando convites e permissões...</p>
        </div>
      ) : (
        <>
          {/* SEÇÃO 1: CONVITES PENDENTES */}
          {pendingShares.length > 0 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <Clock className="w-5 h-5 animate-pulse" />
                <h2>Convites Pendentes ({pendingShares.length})</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingShares.map((share) => (
                  <div 
                    key={share.id} 
                    className="bg-white rounded-xl shadow-sm border-2 border-amber-100 hover:border-amber-200 overflow-hidden transition-all"
                  >
                    <div className="bg-amber-50/60 p-4 border-b border-amber-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-800">
                        <Shield className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Novo Pedido</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(share.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-slate-400 text-xs block mb-1">Remetente</span>
                        <div className="flex items-center gap-2 text-slate-800 font-medium">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-sm">
                            {share.sender.name?.substring(0, 2).toUpperCase() || 'RS'}
                          </div>
                          <div>
                            <div className="text-sm font-bold leading-tight">{share.sender.name || 'Usuário'}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" />
                              {share.sender.email}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400 text-xs block mb-1">Visualização Solicitada</span>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                          <div>
                            <span className="text-xs text-slate-400 block">Cliente</span>
                            <strong className="text-slate-800">{share.client.name}</strong>
                          </div>
                          <HelpCircle className="w-5 h-5 text-slate-300" title="Ao aceitar, você verá o histórico de lançamentos deste cliente." />
                        </div>
                      </div>

                      <div className="pt-2 flex items-center gap-3 border-t border-slate-50">
                        <button
                          onClick={() => handleAcceptShare(share.id, share.client.name)}
                          className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-lg transition-colors shadow-sm gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Aceitar
                        </button>
                        <button
                          onClick={() => handleRejectShare(share.id)}
                          className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-sm rounded-lg border border-slate-200 transition-colors gap-2"
                        >
                          <X className="w-4 h-4" />
                          Recusar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SEÇÃO 2: CONTAS COMPARTILHADAS ATIVAS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-lg font-bold text-slate-800">
                Resumos Compartilhados ({acceptedShares.length})
              </h2>
            </div>

            {acceptedShares.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto mt-8">
                <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Nenhum resumo disponível</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
                  Você ainda não tem contas ativas compartilhadas com você ou aguardando visualização.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {acceptedShares.map((share) => {
                  const balance = share.financials?.netBalance ?? 0;
                  const isNegative = balance < 0;
                  
                  return (
                    <div 
                      key={share.id} 
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group"
                    >
                      {/* Header do Card */}
                      <div className="p-5 border-b border-slate-100">
                        <div className="flex justify-between items-start mb-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
                            Ativo
                          </span>
                          <span className="text-xs text-slate-400">
                            Desde {new Date(share.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        
                        <h3 className="text-lg font-bold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors">
                          {share.client.name}
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <User className="w-3 h-3" />
                          Por: <strong className="font-medium text-slate-700">{share.sender.name}</strong>
                        </p>
                      </div>

                      {/* Seção de Valores Rápidos */}
                      <div className="bg-slate-50/50 px-5 py-4 grid grid-cols-2 gap-4 border-b border-slate-100 flex-grow">
                        <div>
                          <span className="text-xs text-slate-400 block">A Receber</span>
                          <div className="text-emerald-600 font-semibold text-sm flex items-center mt-0.5">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {formatCurrency(share.financials?.totalIncome ?? 0)}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block">A Pagar</span>
                          <div className="text-rose-600 font-semibold text-sm flex items-center mt-0.5">
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {formatCurrency(share.financials?.totalExpense ?? 0)}
                          </div>
                        </div>
                      </div>

                      {/* Saldo Netting e Ação */}
                      <div className="p-4 bg-white mt-auto">
                        <div className="flex items-center justify-between mb-4 px-1">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Netting Total</span>
                          <span className={`text-lg font-black tracking-tight ${isNegative ? 'text-rose-600' : balance > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {formatCurrency(balance)}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedClient({ id: share.client_id, name: share.client.name });
                              setIsStatementOpen(true);
                            }}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors duration-150"
                          >
                            <FileText className="w-4 h-4" />
                            Visualizar Extrato
                          </button>
                          
                          <button
                            onClick={() => handleRejectShare(share.id)}
                            title="Remover acesso"
                            className="p-2.5 text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-xl transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL DE EXTRATO REUTILIZÁVEL */}
      {selectedClient && (
        <ClientStatementModalV2
          isOpen={isStatementOpen}
          onClose={() => {
            setIsStatementOpen(false);
            setSelectedClient(null);
          }}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
        />
      )}
    </div>
  );
}

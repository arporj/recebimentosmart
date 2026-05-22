import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Check, 
  X, 
  FileText, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Mail, 
  Shield, 
  HelpCircle, 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  ChevronDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ClientStatementModalV2 from '../../components/v2/ClientStatementModalV2';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  isAfter, 
  isBefore, 
  isSameMonth, 
  parseISO, 
  addDays, 
  addWeeks, 
  addMonths, 
  addYears, 
  isSameDay,
  subMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface CategoryDropdownProps {
  value: string;
  onChange: (val: string) => void;
  categories: { id: string; name: string; icon?: string }[];
  placeholder?: string;
  isLote?: boolean;
}

function CategoryDropdown({ value, onChange, categories, placeholder = "Selecione categoria...", isLote = false }: CategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = categories.find(c => c.id === value);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full pl-3 pr-8 py-2.5 rounded-2xl text-left flex items-center justify-between text-xs transition-all relative ${
          isLote 
            ? "bg-white border border-teal-100/40 text-teal-800 font-extrabold shadow-sm" 
            : "bg-slate-50 text-slate-700 font-bold border border-transparent hover:bg-slate-100/80"
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="text-sm shrink-0 select-none">{selected?.icon || '📁'}</span>
          <span className="truncate">{selected ? selected.name : placeholder}</span>
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronDown size={14} className={isLote ? "text-teal-600" : ""} />
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
          <div className="absolute z-[70] top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto py-1 animate-in slide-in-from-top-1 duration-150 min-w-[200px]">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                  c.id === value ? "bg-teal-50/50 font-black text-teal-800" : "text-slate-600 font-medium"
                }`}
              >
                <span className="text-sm shrink-0 select-none">{c.icon || '📁'}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface AccountDropdownProps {
  value: string;
  onChange: (val: string) => void;
  accounts: { id: string; name: string; type?: string; bank_icon?: string }[];
  placeholder?: string;
  isLote?: boolean;
}

function AccountDropdown({ value, onChange, accounts, placeholder = "Selecione conta...", isLote = false }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);

  const getAccountTypeLabel = (type?: string) => {
    switch (type) {
      case 'checking': return 'Corrente';
      case 'savings': return 'Poupança';
      case 'investment': return 'Investimento';
      case 'credit_card': return 'Cartão de Crédito';
      default: return 'Conta';
    }
  };

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full pl-3 pr-8 py-2.5 rounded-2xl text-left flex items-center justify-between text-xs transition-all relative ${
          isLote 
            ? "bg-white border border-teal-100/40 text-teal-800 font-extrabold shadow-sm py-2" 
            : "bg-slate-50 text-slate-700 font-bold border border-transparent hover:bg-slate-100/80"
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-5 h-5 rounded-md flex items-center justify-center border bg-white overflow-hidden shrink-0">
            {selected?.bank_icon ? (
              <img 
                src={`https://www.google.com/s2/favicons?domain=${selected.bank_icon}&sz=64`} 
                alt="" 
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-[10px] select-none">🏦</span>
            )}
          </div>
          <span className="truncate text-slate-700">{selected ? selected.name : placeholder}</span>
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronDown size={14} className={isLote ? "text-teal-600" : ""} />
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
          <div className="absolute z-[70] top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto py-1 animate-in slide-in-from-top-1 duration-150 min-w-[200px]">
            {accounts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                  a.id === value ? "bg-teal-50/50 font-black text-teal-800" : "text-slate-600 font-medium"
                }`}
              >
                <div className="w-6 h-6 rounded-md flex items-center justify-center border bg-white overflow-hidden shrink-0">
                  {a.bank_icon ? (
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${a.bank_icon}&sz=64`} 
                      alt="" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] select-none">🏦</span>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-semibold leading-tight">{a.name}</span>
                  <span className="text-[8px] text-slate-400 mt-0.5">{getAccountTypeLabel(a.type)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function SharedWithMeV2() {
  const { user } = useAuth();
  const [shares, setShares] = useState<SharedItem[]>([]);
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Controle do modal de extrato
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);  // Controle do modal de Aceite (Categorizar antes de aceitar)
  const [acceptingShare, setAcceptingShare] = useState<{ id: string; clientName: string } | null>(null);
  const [categories, setCategories] = useState<{id: string; name: string; icon?: string}[]>([]);
  const [accounts, setAccounts] = useState<{id: string; name: string; type?: string; bank_icon?: string}[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [acceptTxsConfig, setAcceptTxsConfig] = useState<Record<string, { categoryId: string; accountId: string }>>({});
  const [isAccepting, setIsAccepting] = useState(false);  // Novos estados para Abas e Notificações de Alteração/Exclusão bilaterais
  const [sentShares, setSentShares] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'shares' | 'sent' | 'updates'>('shares');
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);

  useEffect(() => {
    if (user?.email) {
      fetchShares();
      fetchCategoriesAndAccounts();
    }
  }, [user]);

  const fetchCategoriesAndAccounts = async () => {
    if (!user) return;
    try {
      const [catRes, accRes] = await Promise.all([
        supabase.from('financial_categories').select('id, name, icon').eq('user_id', user.id).order('name'),
        supabase.from('financial_accounts').select('id, name, type, bank_icon').eq('user_id', user.id).eq('is_active', true).order('name')
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (accRes.data) {
        setAccounts(accRes.data);
        if (accRes.data.length === 1) {
          setSelectedAccount(accRes.data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

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
           client:clients(id, name, phone),
           sender:profiles!client_shares_sender_id_fkey(id, name, email)
        `)
        .ilike('receiver_email', user?.email || '')
        .order('created_at', { ascending: false });

      if (sharesError) throw sharesError;

      let items = (sharesData || []) as any as SharedItem[];

      // Filtra compartilhamentos rejeitados (não exibir na interface de recebidos)
      items = items.filter(item => item.status !== 'rejected');

      // 1.1 Buscar os compartilhamentos enviados (onde eu sou o sender)
      const { data: sentSharesData, error: sentSharesError } = await supabase
        .from('client_shares')
        .select(`
           id,
           client_id,
           status,
           created_at,
           receiver_email,
           client:clients(id, name)
        `)
        .eq('sender_id', user?.id)
        .order('created_at', { ascending: false });

      let activeSentShares: any[] = [];
      if (!sentSharesError && sentSharesData) {
        if (sentSharesData.length > 0) {
          const sentClientIds = sentSharesData.map(s => s.client_id);
          const { data: sentTxData, error: sentTxError } = await supabase
            .from('financial_transactions')
            .select('client_id')
            .neq('status', 'cancelled')
            .in('client_id', sentClientIds);

          const clientsWithActiveTx = !sentTxError && sentTxData 
            ? new Set(sentTxData.map(tx => tx.client_id))
            : new Set();
          
          activeSentShares = sentSharesData.filter(s => clientsWithActiveTx.has(s.client_id));
        }
      } else if (sentSharesError) {
        console.error('Erro ao buscar compartilhamentos enviados:', sentSharesError);
      }
      setSentShares(activeSentShares);

      // Buscar transações dos itens pendentes para mostrar o extrato antes de aceitar
      let localPendingTxData: any[] = [];
      const pendingItems = items.filter(item => item.status === 'pending');
      if (pendingItems.length > 0) {
        const pendingClientIds = pendingItems.map(item => item.client_id);
        const { data: pendingTxData, error: pendingTxError } = await supabase
          .from('financial_transactions')
          .select('id, client_id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current')
          .neq('status', 'cancelled')
          .in('client_id', pendingClientIds)
          .is('parent_id', null);

        if (!pendingTxError && pendingTxData) {
          localPendingTxData = pendingTxData;
          setPendingTransactions(localPendingTxData);
        } else {
          setPendingTransactions([]);
        }
      } else {
        setPendingTransactions([]);
      }

      // 2. Para itens aceitos, buscar transações físicas ativas para expansão local de recorrências
      let localTxData: any[] = [];
      const acceptedItems = items.filter(item => item.status === 'accepted');
      
      if (acceptedItems.length > 0) {
        const clientIds = acceptedItems.map(item => item.client_id);
        
        const { data: txData, error: txError } = await supabase
          .from('financial_transactions')
          .select('id, client_id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current')
          .neq('status', 'cancelled')
          .in('client_id', clientIds);

        if (txError) throw txError;
        localTxData = txData || [];
        setRawTransactions(localTxData);

        // Define o mês inicial baseado na transação compartilhada mais antiga
        if (localTxData && localTxData.length > 0) {
          const earliestDate = localTxData.reduce((minDate: Date, tx: any) => {
            const txDate = parseISO(tx.date);
            return isBefore(txDate, minDate) ? txDate : minDate;
          }, parseISO(localTxData[0].date));
          
          setCurrentMonth(startOfMonth(earliestDate));
        }
      } else {
        setRawTransactions([]);
      }

      setShares(items);

      // 3. Buscar atualizações pendentes bilaterais de forma robusta e à prova de falhas de PostgREST joins
      let localUpdatesData: any[] = [];
      if (user) {
        const { data: updatesData, error: updatesError } = await supabase
          .from('shared_transaction_updates')
          .select('*')
          .eq('receiver_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (updatesError) throw updatesError;

        let updatesWithSenders: any[] = [];
        if (updatesData && updatesData.length > 0) {
          localUpdatesData = updatesData;
          const senderIds = Array.from(new Set(updatesData.map(u => u.sender_id)));
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', senderIds);
            
          const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

          // Buscar detalhes das transações (descrição e nome do cliente) para exibição enriquecida
          const txIds = Array.from(new Set([
            ...updatesData.map(u => u.transaction_id),
            ...updatesData.map(u => u.original_transaction_id)
          ].filter(Boolean)));

          const { data: txInfoData } = await supabase
            .from('financial_transactions')
            .select(`
              id, 
              description, 
              date, 
              amount, 
              client:clients(name)
            `)
            .in('id', txIds);

          const txInfoMap = new Map(txInfoData?.map((t: any) => [t.id, t]) || []);

          updatesWithSenders = updatesData.map(u => {
            const txInfo = txInfoMap.get(u.transaction_id) || txInfoMap.get(u.original_transaction_id);
            return {
              ...u,
              sender: profilesMap.get(u.sender_id) || { id: u.sender_id, name: 'Usuário', email: '' },
              transaction_description: txInfo?.description || 'Lançamento Compartilhado',
              client_name: txInfo?.client?.name || 'Cliente Vinculado'
            };
          });
        }
        setPendingUpdates(updatesWithSenders);
      }

      // Definir aba ativa padrão caso ainda não tenha sido definida
      if (!hasSetDefaultTab) {
        const activeAcceptedCount = items.filter(s => s.status === 'accepted' && localTxData.some(tx => tx.client_id === s.client_id)).length;
        if (activeAcceptedCount === 0 && activeSentShares.length > 0) {
          setActiveTab('sent');
        } else if (activeAcceptedCount === 0 && activeSentShares.length === 0 && localUpdatesData.length > 0) {
          setActiveTab('updates');
        }
        setHasSetDefaultTab(true);
      }
    } catch (err) {
      console.error('Erro ao buscar compartilhados:', err);
      toast.error('Falha ao carregar contas compartilhadas.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveUpdate = async (updateId: string, action: 'accepted' | 'rejected', description: string, updateType: 'update' | 'delete') => {
    const actionLabel = action === 'accepted' ? 'aceitar' : 'rejeitar';
    const typeLabel = updateType === 'delete' ? 'exclusão' : 'alteração';
    const confirmed = window.confirm(`Deseja realmente ${actionLabel} esta proposta de ${typeLabel} para o lançamento "${description}"?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('fn_resolve_shared_update', {
        p_update_id: updateId,
        p_action: action
      });

      if (error) throw error;

      toast.success(`Notificação de ${typeLabel} processada: ${action === 'accepted' ? 'Aceita' : 'Rejeitada'}!`);
      fetchShares();
    } catch (err) {
      console.error('Erro ao resolver atualização:', err);
      toast.error('Erro ao processar sua resposta.');
    }
  };

  const processedShares = useMemo((): SharedItem[] => {
    const instances: any[] = [];
    const maxDate = endOfMonth(currentMonth);

    // Identificar registros físicos daquela cadeia por cliente para evitar duplicações
    const physicalDatesByParent = new Map<string, Set<string>>();
    for (const t of rawTransactions) {
      const parentId = t.parent_id || t.id;
      const key = `${t.client_id}_${parentId}`;
      if (!physicalDatesByParent.has(key)) {
        physicalDatesByParent.set(key, new Set());
      }
      physicalDatesByParent.get(key)!.add(t.date);
    }

    for (const t of rawTransactions) {
      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        if (isBefore(tDate, maxDate) || isSameDay(tDate, maxDate)) {
          instances.push({ ...t, instanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
      
      let cursor = new Date(tDate);
      const parentId = t.id;
      const key = `${t.client_id}_${parentId}`;
      
      while (isBefore(cursor, maxDate) || isSameDay(cursor, maxDate)) {
        if (recEndDate && isAfter(cursor, recEndDate)) break;

        const dateStr = format(cursor, 'yyyy-MM-dd');
        const alreadyHasPhysical = physicalDatesByParent.get(key)?.has(dateStr);

        if (!alreadyHasPhysical || dateStr === t.date) {
          const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          const currentInst = (t.installment_current || 1) + monthsDiff;

          if (period === 'parcelada' && t.installment_total && currentInst > t.installment_total) {
            break;
          }

          instances.push({
            ...t,
            instanceDate: dateStr,
            isVirtual: dateStr !== t.date,
            status: dateStr !== t.date ? 'pending' : t.status,
            installment_current: currentInst,
          });
        }
        
        switch (period) {
          case 'daily': cursor = addDays(cursor, interval); break;
          case 'weekly': cursor = addWeeks(cursor, interval); break;
          case 'monthly': cursor = addMonths(cursor, interval); break;
          case 'yearly': cursor = addYears(cursor, interval); break;
          default: cursor = addMonths(cursor, interval);
        }
      }
    }

    return shares.map(share => {
      if (share.status !== 'accepted') return share;

      const clientInstances = instances.filter(inst => 
        inst.client_id === share.client_id && 
        isSameMonth(parseISO(inst.instanceDate), currentMonth)
      );

      const pendingInstances = clientInstances.filter(inst => inst.status === 'pending');

      // As transações já vêm com o tipo (income/expense) correto para o recebedor,
      // pois o gatilho SQL `fn_accept_share` inverte os papéis ao clonar.
      const totalIncome = pendingInstances
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const totalExpense = pendingInstances
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        ...share,
        financials: {
          totalIncome,
          totalExpense,
          netBalance: totalIncome - totalExpense
        }
      };
    });
  }, [shares, rawTransactions, currentMonth]);

  const handleOpenAcceptModal = async (shareId: string, clientName: string) => {
    const share = shares.find(s => s.id === shareId);
    if (!share) return;

    const clientTxs = pendingTransactions.filter(tx => tx.client_id === share.client_id);

    if (clientTxs.length === 0) {
      setIsAccepting(true);
      try {
        const { error } = await supabase.rpc('fn_accept_share_v2', {
          p_share_id: shareId,
          p_configs: []
        });

        if (error) throw error;

        toast.success(`Você aceitou o compartilhamento de "${clientName}"!`);
        fetchShares();
      } catch (err) {
        console.error('Erro ao aceitar compartilhamento:', err);
        toast.error('Erro ao aceitar convite.');
      } finally {
        setIsAccepting(false);
      }
      return;
    }

    setSelectedCategory('');
    if (accounts.length === 1) {
      setSelectedAccount(accounts[0].id);
    } else {
      setSelectedAccount('');
    }

    const initialConfig: Record<string, { categoryId: string; accountId: string }> = {};
    clientTxs.forEach(tx => {
      initialConfig[tx.id] = {
        categoryId: '',
        accountId: accounts.length === 1 ? accounts[0].id : ''
      };
    });
    setAcceptTxsConfig(initialConfig);
    setAcceptingShare({ id: shareId, clientName });
  };

  const handleGlobalCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setAcceptTxsConfig(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(txId => {
        updated[txId] = { ...updated[txId], categoryId: val };
      });
      return updated;
    });
  };

  const handleGlobalAccountChange = (val: string) => {
    setSelectedAccount(val);
    setAcceptTxsConfig(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(txId => {
        updated[txId] = { ...updated[txId], accountId: val };
      });
      return updated;
    });
  };

  const handleRowCategoryChange = (txId: string, val: string) => {
    setAcceptTxsConfig(prev => ({
      ...prev,
      [txId]: { ...prev[txId], categoryId: val }
    }));
  };

  const handleRowAccountChange = (txId: string, val: string) => {
    setAcceptTxsConfig(prev => ({
      ...prev,
      [txId]: { ...prev[txId], accountId: val }
    }));
  };

  const handleConfirmAcceptShare = async () => {
    if (!acceptingShare) return;

    const share = shares.find(s => s.id === acceptingShare.id);
    if (!share) return;
    const clientTxs = pendingTransactions.filter(tx => tx.client_id === share.client_id);

    const configsArray: { original_transaction_id: string; category_id: string; account_id: string }[] = [];
    
    for (const tx of clientTxs) {
      const config = acceptTxsConfig[tx.id];
      if (!config || !config.categoryId || !config.accountId) {
        toast.error(`Selecione uma categoria e uma conta para o lançamento "${tx.description || 'Sem descrição'}".`);
        return;
      }
      configsArray.push({
        original_transaction_id: tx.id,
        category_id: config.categoryId,
        account_id: config.accountId
      });
    }

    setIsAccepting(true);
    try {
      const { error } = await supabase.rpc('fn_accept_share_v2', {
        p_share_id: acceptingShare.id,
        p_configs: configsArray
      });

      if (error) throw error;

      toast.success(`Você aceitou o compartilhamento de "${acceptingShare.clientName}"!`);
      setAcceptingShare(null);
      fetchShares();
    } catch (err) {
      console.error('Erro ao aceitar compartilhamento:', err);
      toast.error('Erro ao aceitar convite.');
    } finally {
      setIsAccepting(false);
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

  const handleRevokeShare = async (shareId: string, clientName: string, receiverEmail: string) => {
    const confirmed = window.confirm(`Deseja realmente revogar o compartilhamento do cliente "${clientName}" com "${receiverEmail}"?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('client_shares')
        .delete()
        .eq('id', shareId);

      if (error) throw error;

      toast.success('Compartilhamento revogado com sucesso.');
      fetchShares();
    } catch (err) {
      console.error('Erro ao revogar compartilhamento:', err);
      toast.error('Erro ao revogar compartilhamento.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const pendingShares = processedShares.filter(s => s.status === 'pending');
  const acceptedShares = processedShares.filter(s => 
    s.status === 'accepted' && 
    rawTransactions.some(tx => tx.client_id === s.client_id)
  );
  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Topo da página */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-2xl shadow-sm border border-teal-100/50">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Lançamentos Compartilhados
            </h1>
          </div>
          <p className="text-slate-500 mt-2 text-sm max-w-xl">
            Acesse resumos e extratos compartilhados por outros parceiros e clientes no sistema.
          </p>
        </div>

        {/* Seletor Mensal Premium */}
        {acceptedShares.length > 0 && (
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between gap-4 shrink-0 min-w-[280px]">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} 
              className="p-2 hover:bg-slate-50 active:scale-95 rounded-xl transition-all border border-slate-100"
            >
              <ChevronLeft size={18} className="text-slate-600" />
            </button>
            <div className="text-center flex-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Mês de Referência</span>
              <h2 className="text-sm font-black text-slate-800 capitalize font-manrope">{monthLabel}</h2>
            </div>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} 
              className="p-2 hover:bg-slate-50 active:scale-95 rounded-xl transition-all border border-slate-100"
            >
              <ChevronRight size={18} className="text-slate-600" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando convites e permissões...</p>
        </div>
      ) : (
        <>
          {/* SEÇÃO 1: CONVITES PENDENTES */}
          {pendingShares.length > 0 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <Clock className="w-5 h-5 animate-pulse" />
                <h2 className="text-sm font-black uppercase tracking-wider">Convites Pendentes ({pendingShares.length})</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingShares.map((share) => (
                  <div 
                    key={share.id} 
                    className="bg-white rounded-2xl shadow-sm border-2 border-amber-100 hover:border-amber-200 overflow-hidden transition-all"
                  >
                    <div className="bg-amber-50/60 p-4 border-b border-amber-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-800">
                        <Shield className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Novo Pedido</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(share.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-slate-400 text-xs block mb-1">Remetente</span>
                        <div className="flex items-center gap-2 text-slate-800 font-medium">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-sm font-black">
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
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-2">
                          Lançamentos Compartilhados
                        </span>
                        {(() => {
                          const clientTxs = pendingTransactions.filter(tx => tx.client_id === share.client_id);
                          if (clientTxs.length === 0) {
                            return (
                              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500 font-medium">
                                Nenhum lançamento encontrado neste compartilhamento.
                              </div>
                            );
                          }

                          return (
                            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                              {clientTxs.map((tx) => {
                                // Inverter o tipo para a perspectiva do receptor
                                const isInvertedIncome = tx.type === 'expense'; // Despesa para o remetente = Receita (Entrada) para o receptor
                                const typeLabel = isInvertedIncome ? 'Entrada' : 'Saída';
                                const typeColor = isInvertedIncome 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                  : 'bg-rose-50 text-rose-700 border-rose-100';
                                
                                return (
                                  <div 
                                    key={tx.id} 
                                    className="py-1.5 px-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between gap-3 hover:bg-slate-100/50 transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-slate-800 text-[11px] font-bold truncate block">{tx.description || 'Sem descrição'}</span>
                                      <div className="flex items-center gap-1.5 mt-0">
                                        <span className="text-[10px] text-slate-400 font-semibold">{format(parseISO(tx.date), 'dd/MM/yyyy')}</span>
                                        <span className="text-[8px] text-slate-300">•</span>
                                        <span className="text-[10px] text-slate-400 font-medium">
                                          {tx.recurrence_enabled ? (tx.recurrence_period === 'parcelada' ? 'Parcelado' : 'Recorrente') : 'Único'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="text-[11px] font-extrabold text-slate-800 block">
                                        {formatCurrency(Number(tx.amount))}
                                      </span>
                                      <span className={`inline-flex px-1.5 py-0.2 rounded-full text-[8px] font-bold border mt-0 ${typeColor}`}>
                                        {typeLabel}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="pt-2 flex items-center gap-3 border-t border-slate-50">
                        <button
                          onClick={() => handleOpenAcceptModal(share.id, share.client.name)}
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

          {/* NAVEGAÇÃO DE ABAS */}
          <div className="flex border-b border-slate-200 mb-6 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 max-w-xl w-full">
            <button
              onClick={() => setActiveTab('shares')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'shares'
                  ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users size={16} />
              Recebidos ({acceptedShares.length})
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'sent'
                  ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users size={16} />
              Enviados ({sentShares.length})
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all relative ${
                activeTab === 'updates'
                  ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Clock size={16} />
              Notificações
              {pendingUpdates.length > 0 && (
                <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                  {pendingUpdates.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'shares' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">
                  Resumos Compartilhados Recebidos ({acceptedShares.length})
                </h2>
              </div>

              {acceptedShares.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto mt-8 shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-slate-800">Nenhum resumo disponível</h3>
                  <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
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
                        className="bg-white rounded-[2rem] shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group"
                      >
                        {/* Header do Card com Nome do Remetente */}
                        <div className="p-6 border-b border-slate-100">
                          <div className="flex justify-between items-start mb-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
                              Ativo
                            </span>
                            <span className="text-[10px] font-black tracking-wide text-slate-400 uppercase">
                              Desde {new Date(share.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          
                          <h3 className="text-xl font-extrabold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors tracking-tight">
                            {share.sender.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-bold uppercase tracking-wider">
                            <Mail className="w-3 h-3 text-slate-300" />
                            {share.sender.email}
                          </p>
                        </div>

                        {/* Seção de Valores Rápidos (Inversão aplicada no totalIncome e totalExpense) */}
                        <div className="bg-slate-50/50 px-6 py-5 grid grid-cols-2 gap-4 border-b border-slate-100 flex-grow">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">A Receber</span>
                            <div className="text-emerald-600 font-black text-base flex items-center mt-1">
                              <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
                              {formatCurrency(share.financials?.totalIncome ?? 0)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">A Pagar</span>
                            <div className="text-rose-600 font-black text-base flex items-center mt-1">
                              <TrendingDown className="w-4 h-4 mr-1 text-rose-500" />
                              {formatCurrency(share.financials?.totalExpense ?? 0)}
                            </div>
                          </div>
                        </div>

                        {/* Saldo Netting e Ação */}
                        <div className="p-6 bg-white mt-auto">
                          <div className="flex items-center justify-between mb-5 px-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Netting do Mês</span>
                            <span className={`text-lg font-black tracking-tight ${isNegative ? 'text-rose-600' : balance > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {formatCurrency(balance)}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedClient({ id: share.client_id, name: share.sender.name });
                                setIsStatementOpen(true);
                              }}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-extrabold text-sm shadow-sm transition-colors duration-150 active:scale-95"
                            >
                              <FileText className="w-4 h-4" />
                              Visualizar Extrato
                            </button>
                            
                            <button
                              onClick={() => handleRejectShare(share.id)}
                              title="Remover acesso"
                              className="p-3 text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-2xl transition-colors active:scale-95"
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
          )}

          {activeTab === 'sent' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">
                  Compartilhamentos Enviados ({sentShares.length})
                </h2>
              </div>

              {sentShares.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto mt-8 shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-slate-800">Nenhum resumo compartilhado</h3>
                  <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
                    Você ainda não compartilhou nenhum cliente com outros usuários. Você pode fazer isso ao cadastrar ou editar um cliente no menu "Clientes".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sentShares.map((share) => {
                    const isPending = share.status === 'pending';
                    const isAccepted = share.status === 'accepted';
                    const isRejected = share.status === 'rejected';

                    let statusBadgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
                    let statusText = 'Aguardando Aceite';
                    if (isAccepted) {
                      statusBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                      statusText = 'Aceito';
                    } else if (isRejected) {
                      statusBadgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
                      statusText = 'Recusado';
                    }

                    return (
                      <div 
                        key={share.id} 
                        className="bg-white rounded-[2rem] shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group animate-fade-in"
                      >
                        {/* Header do Card com Nome do Cliente original */}
                        <div className="p-6 border-b border-slate-100">
                          <div className="flex justify-between items-start mb-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor}`}>
                              {statusText}
                            </span>
                            <span className="text-[10px] font-black tracking-wide text-slate-400 uppercase">
                              {new Date(share.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          
                          <h3 className="text-xl font-extrabold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors tracking-tight">
                            {share.client?.name}
                          </h3>
                        </div>

                        {/* Corpo com email do Destinatário */}
                        <div className="bg-slate-50/50 px-6 py-5 flex-grow space-y-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Destinatário</span>
                            <div className="text-slate-700 font-extrabold text-sm flex items-center mt-1 font-manrope">
                              <Mail className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                              {share.receiver_email}
                            </div>
                          </div>
                        </div>

                        {/* Ação de Revogar */}
                        <div className="p-6 bg-white border-t border-slate-50 mt-auto">
                          <button
                            onClick={() => handleRevokeShare(share.id, share.client?.name, share.receiver_email)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-700 border border-slate-200 rounded-2xl font-extrabold text-sm transition-colors duration-150 active:scale-95"
                          >
                            <X className="w-4 h-4" />
                            Revogar Compartilhamento
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">
                  Notificações de Alteração/Exclusão ({pendingUpdates.length})
                </h2>
              </div>

              {pendingUpdates.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto mt-8 shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-slate-800">Sem notificações pendentes</h3>
                  <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
                    Você não possui atualizações ou exclusões de lançamentos aguardando sua resposta neste momento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                  {pendingUpdates.map((update) => {
                    const isDelete = update.update_type === 'delete';
                    
                    return (
                      <div 
                        key={update.id} 
                        className={`bg-white rounded-[2rem] shadow-sm border-2 overflow-hidden flex flex-col transition-all duration-200 ${
                          isDelete ? 'border-rose-100 hover:border-rose-200' : 'border-teal-100 hover:border-teal-200'
                        }`}
                      >
                        {/* Header da Notificação */}
                        <div className={`p-4 border-b flex justify-between items-center ${
                          isDelete ? 'bg-rose-50/60 border-rose-100 text-rose-800' : 'bg-teal-50/60 border-teal-100 text-teal-800'
                        }`}>
                          <div className="flex items-center gap-2">
                            <Clock size={16} />
                            <span className="text-xs font-black uppercase tracking-wider">
                              {isDelete ? 'Exclusão Pendente' : 'Alteração Pendente'}
                            </span>
                          </div>
                          
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-white/80">
                            {update.scope === 'all_future' ? 'Lote (Futuros)' : 'Apenas Este'}
                          </span>
                        </div>

                        {/* Corpo da Notificação */}
                        <div className="p-6 flex-grow space-y-4">
                          {/* Remetente */}
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-sm font-black">
                              {update.sender.name?.substring(0, 2).toUpperCase() || 'RS'}
                            </div>
                            <div>
                              <div className="text-xs text-slate-400 uppercase tracking-widest font-black">Autor da Ação</div>
                              <div className="text-sm font-black text-slate-800 leading-tight">
                                {update.sender.name}
                              </div>
                            </div>
                          </div>

                          {/* Lançamento Envolvido */}
                          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lançamento</span>
                              <strong className="text-slate-800 text-sm block font-extrabold truncate">
                                {update.transaction_description}
                              </strong>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                                Cliente: {update.client_name}
                              </span>
                            </div>

                            {/* Detalhes De / Para para Update */}
                            {!isDelete && (
                              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200/60">
                                {update.old_amount !== update.new_amount && (
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Valor</span>
                                    <div className="text-xs text-slate-500 line-through">
                                      {formatCurrency(Number(update.old_amount))}
                                    </div>
                                    <div className="text-xs font-black text-emerald-600">
                                      {formatCurrency(Number(update.new_amount))}
                                    </div>
                                  </div>
                                )}
                                
                                {update.old_date !== update.new_date && (
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Data</span>
                                    <div className="text-xs text-slate-500 line-through">
                                      {update.old_date ? format(parseISO(update.old_date), 'dd/MM/yyyy') : '-'}
                                    </div>
                                    <div className="text-xs font-black text-teal-600">
                                      {update.new_date ? format(parseISO(update.new_date), 'dd/MM/yyyy') : '-'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {isDelete && (
                              <div className="pt-2 border-t border-slate-200/60">
                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                  {update.scope === 'all_future' 
                                    ? 'A exclusão em lote foi realizada na origem. Ao aceitar, este e todos os lançamentos futuros vinculados a este lote também serão excluídos.' 
                                    : 'A exclusão deste lançamento foi realizada na origem. Ao aceitar, o lançamento local correspondente será removido.'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                          <button
                            onClick={() => handleResolveUpdate(update.id, 'accepted', update.transaction_description, update.update_type)}
                            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm gap-2 transition-colors duration-150"
                          >
                            <Check className="w-4 h-4" />
                            Aceitar
                          </button>
                          
                          <button
                            onClick={() => handleResolveUpdate(update.id, 'rejected', update.transaction_description, update.update_type)}
                            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 font-extrabold text-xs rounded-xl border border-slate-200 gap-2 transition-colors duration-150"
                          >
                            <X className="w-4 h-4" />
                            Recusar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
          selectedMonth={currentMonth}
        />
      )}
      {/* MODAL DE ACEITE (CATEGORIA E CONTA) */}
      {acceptingShare && (() => {
        const share = shares.find(s => s.id === acceptingShare.id);
        const clientTxs = share ? pendingTransactions.filter(tx => tx.client_id === share.client_id) : [];

        return (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-600" />
                    Aceitar Compartilhamento
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Cliente original: <strong className="text-slate-700">{acceptingShare.clientName}</strong>
                  </p>
                </div>
                <button onClick={() => setAcceptingShare(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              {/* Corpo com scroll se necessário */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Para aceitar o histórico de lançamentos compartilhados, associe uma categoria e uma conta bancária para cada um. 
                  Você pode usar a primeira linha (<strong className="text-teal-700">⚡ PREENCHER EM LOTE</strong>) para preencher automaticamente todas as linhas de uma vez só, ou personalizar cada uma individualmente.
                </p>

                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 min-w-[240px]">Lançamento</th>
                          <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right min-w-[100px]">Valor</th>
                          <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 min-w-[200px]">Categoria</th>
                          <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 min-w-[200px]">Conta Bancária</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {/* LINHA DE LOTE / CABEÇALHO */}
                        <tr className="bg-teal-50/40 border-b border-teal-100/50">
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-black text-teal-800 tracking-wider flex items-center gap-1.5">
                              ⚡ PREENCHER EM LOTE
                            </span>
                            <span className="text-[9px] text-teal-600/80 font-bold block mt-0.5">
                              Aplica a todas as linhas abaixo
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-slate-400 font-bold">-</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <CategoryDropdown
                              value={selectedCategory}
                              onChange={handleGlobalCategoryChange}
                              categories={categories}
                              placeholder="Selecione categoria em lote..."
                              isLote={true}
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <AccountDropdown
                              value={selectedAccount}
                              onChange={handleGlobalAccountChange}
                              accounts={accounts}
                              placeholder="Selecione conta em lote..."
                              isLote={true}
                            />
                          </td>
                        </tr>

                        {/* LINHAS DE LANÇAMENTOS REAIS */}
                        {clientTxs.map((tx) => {
                          const isInvertedIncome = tx.type === 'expense';
                          const typeLabel = isInvertedIncome ? 'Entrada' : 'Saída';
                          const typeColor = isInvertedIncome 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-rose-50 text-rose-700 border-rose-100';

                          const config = acceptTxsConfig[tx.id] || { categoryId: '', accountId: '' };

                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3.5">
                                <span className="text-slate-800 text-xs font-bold block truncate max-w-[240px]">
                                  {tx.description || 'Sem descrição'}
                                </span>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-slate-400 font-semibold">
                                    {format(parseISO(tx.date), 'dd/MM/yyyy')}
                                  </span>
                                  <span className="text-[8px] text-slate-300">•</span>
                                  <span className={`inline-flex px-1.5 py-0.2 rounded-full text-[8px] font-bold border ${typeColor}`}>
                                    {typeLabel}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <span className="text-xs font-black text-slate-900 block">
                                  {formatCurrency(Number(tx.amount))}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <CategoryDropdown
                                  value={config.categoryId}
                                  onChange={(val) => handleRowCategoryChange(tx.id, val)}
                                  categories={categories}
                                  placeholder="Selecione categoria..."
                                />
                              </td>
                              <td className="px-4 py-3.5">
                                <AccountDropdown
                                  value={config.accountId}
                                  onChange={(val) => handleRowAccountChange(tx.id, val)}
                                  accounts={accounts}
                                  placeholder="Selecione conta..."
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setAcceptingShare(null)}
                  className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-sm"
                  disabled={isAccepting}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmAcceptShare}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/30 transition-colors flex items-center gap-2 text-sm"
                  disabled={isAccepting}
                >
                  {isAccepting ? 'Aceitando...' : (
                    <>
                      <Check size={18} />
                      Confirmar Aceite
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

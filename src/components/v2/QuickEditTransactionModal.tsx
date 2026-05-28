import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  CheckSquare,
  Square,
  Trash2,
  Save,
  Tag as TagIcon,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { editarTransacao as editarTransacaoFinanceira } from '../../lib/financeiro/editarTransacao';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { ModalOpcaoRecorrente } from '../financeiro/ModalOpcaoRecorrente';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface QuickEditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: any;
  isConfirming?: boolean;
}

const QuickEditTransactionModal = ({
  isOpen,
  onClose,
  onSuccess,
  transaction,
  isConfirming = false,
}: QuickEditTransactionModalProps) => {
  const { user } = useAuth();

  // Form fields
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPaid, setIsPaid] = useState(false);

  // Data lists
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);

  // UI states
  const [loading, setLoading] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);

  // Scope modal for recurrent/installment transactions
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<'edit' | 'delete'>('edit');
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  // Delete confirm for unique transactions
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const isRecurring = transaction?.modalidade === 'recorrente' || transaction?.modalidade === 'parcelada' || !!transaction?.parent_id || transaction?.recurrence_enabled;

  useEscapeKey(() => {
    if (isScopeModalOpen || isDeleteConfirmOpen) return;
    onClose();
  }, isOpen);

  // Populate form fields
  useEffect(() => {
    if (isOpen && transaction) {
      setDate(transaction.originalInstanceDate || transaction.date || format(new Date(), 'yyyy-MM-dd'));
      setDescription(transaction.description || '');
      setAccountId(transaction.account_id || '');
      setCategoryId(transaction.category_id || '');
      setIsPaid(isConfirming ? true : transaction.status === 'paid');

      // Format amount
      const amountCents = Math.round((transaction.amount || 0) * 100);
      setAmount(
        new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amountCents / 100)
      );

      // Tags
      if (transaction.tags) {
        setSelectedTags(transaction.tags.map((t: any) => t.tag?.id || t.id).filter(Boolean));
      } else {
        setSelectedTags([]);
      }
    }
  }, [isOpen, transaction, isConfirming]);

  // Fetch data
  useEffect(() => {
    if (isOpen && user) {
      fetchAccounts();
      fetchCategories();
      fetchTags();
    }
  }, [isOpen, user]);

  // Close tag dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from('financial_accounts')
      .select('id, name, type')
      .eq('user_id', user?.id || '')
      .eq('is_active', true)
      .order('name');
    if (data) setAccounts(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('financial_categories')
      .select('id, name, icon, parent_id')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setCategories(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from('financial_tags')
      .select('*')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setTags(data);
  };

  const formatCurrency = (value: string) => {
    const cleanValue = value.replace(/\D/g, '');
    const cents = parseInt(cleanValue || '0');
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatCurrency(e.target.value));
  };

  // Organize categories as parent -> children
  const organizedCategories = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id);
    return parents.map((p) => ({
      ...p,
      children: categories.filter((c) => c.parent_id === p.id),
    }));
  }, [categories]);

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      checking: 'Corrente',
      savings: 'Poupança',
      credit_card: 'Cartão',
      investment: 'Investimento',
    };
    return labels[type] || type;
  };

  const handleSave = async (scope?: 'this' | 'following' | 'all') => {
    const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (!amount || parsedAmount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      setLoading(true);

      const payload: any = {
        date,
        amount: parsedAmount,
        description,
        account_id: accountId || undefined,
        category_id: categoryId || undefined,
        status: isPaid ? 'paid' : 'pending',
        tags: selectedTags,
      };

      // If recurrent and no scope selected yet, ask
      if (isRecurring && !scope) {
        setPendingPayload(payload);
        setScopeAction('edit');
        setIsScopeModalOpen(true);
        setLoading(false);
        return;
      }

      const finalScope = scope || 'this';

      // Handle virtual instances: insert physical child
      if (transaction.isVirtual && finalScope === 'this') {
        const { tags: _tags, ...dbPayload } = payload;
        const newChildPayload = {
          ...dbPayload,
          user_id: user!.id,
          type: transaction.type,
          parent_id: transaction.parent_id || transaction.id,
          modalidade: 'unica',
          is_customized: true,
          installment_current: transaction.installment_current || 1,
          recurrence_enabled: false,
        };
        const { data: newChild, error } = await supabase
          .from('financial_transactions')
          .insert(newChildPayload)
          .select('id')
          .single();
        if (error) throw error;

        if (selectedTags.length > 0 && newChild) {
          const junctionRows = selectedTags.map((tagId) => ({
            transaction_id: newChild.id,
            tag_id: tagId,
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      } else {
        const { error } = await editarTransacaoFinanceira(transaction.id, payload, finalScope);
        if (error) throw error;
      }

      toast.success(isConfirming ? 'Lançamento confirmado!' : 'Lançamento atualizado!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (scope?: 'this' | 'following' | 'all') => {
    // If recurrent and no scope, ask
    if (isRecurring && !scope) {
      setScopeAction('delete');
      setIsScopeModalOpen(true);
      return;
    }

    // If unique and no confirmation yet, ask
    if (!isRecurring && !isDeleteConfirmOpen && !scope) {
      setIsDeleteConfirmOpen(true);
      return;
    }

    try {
      setLoading(true);
      const { error } = await deletarTransacao({
        transactionId: transaction.id,
        scope: scope || 'this',
        instanceDate: transaction.originalInstanceDate || transaction.instanceDate || transaction.date,
      });
      if (error) throw error;
      toast.success('Excluído!');
      onSuccess();
      onClose();
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setLoading(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleScopeSelect = (scope: 'this' | 'following' | 'all') => {
    setIsScopeModalOpen(false);
    if (scopeAction === 'edit') {
      handleSave(scope);
    } else {
      handleDelete(scope);
    }
  };

  if (!isOpen || !transaction) return null;

  const typeColors = {
    income: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: '🟢 Receita' },
    expense: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', label: '🔴 Despesa' },
    transfer: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', label: '🔵 Transferência' },
  };
  const tc = typeColors[transaction.type as keyof typeof typeColors] || typeColors.expense;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
          {/* Header */}
          <header className="px-5 py-4 flex justify-between items-center border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
              <div>
                <h2 className="text-base font-black text-slate-900 font-manrope">
                  {isConfirming ? 'Confirmar Lançamento' : 'Editar Lançamento'}
                </h2>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${tc.text}`}>
                  {tc.label}
                </span>
              </div>
            </div>
            {isRecurring && (
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                {(transaction as any).modalidade === 'parcelada' ? 'Parcelado' : 'Recorrente'}
              </span>
            )}
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Valor */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Valor (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={handleAmountChange}
                className={`w-full text-2xl font-black py-3 px-4 rounded-2xl border-2 transition-all focus:outline-none focus:ring-2 ${tc.border} ${tc.bg} ${tc.text} focus:ring-offset-1`}
                placeholder="0,00"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Descrição</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium text-slate-800 transition-all"
                placeholder="Ex: Aluguel, Salário..."
              />
            </div>

            {/* Data */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Data</label>
              <div className="relative">
                <CalendarIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full py-2.5 pl-10 pr-4 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium text-slate-800 transition-all"
                />
              </div>
            </div>

            {/* Conta */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Conta</label>
              <div className="relative">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium text-slate-800 appearance-none cursor-pointer transition-all bg-white"
                >
                  <option value="">Selecione...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({getAccountTypeLabel(acc.type)})
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Categoria */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Categoria</label>
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium text-slate-800 appearance-none cursor-pointer transition-all bg-white"
                >
                  <option value="">Selecione...</option>
                  {organizedCategories.map((parent) => (
                    <optgroup key={parent.id} label={`${parent.icon || ''} ${parent.name}`}>
                      {parent.children.length > 0 ? (
                        parent.children.map((child: any) => (
                          <option key={child.id} value={child.id}>
                            {child.icon || ''} {child.name}
                          </option>
                        ))
                      ) : (
                        <option value={parent.id}>{parent.icon || ''} {parent.name}</option>
                      )}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Tags */}
            <div ref={tagRef} className="relative">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Tags</label>
              <button
                type="button"
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 focus:border-teal-400 text-sm font-medium text-slate-800 text-left flex items-center justify-between bg-white hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <TagIcon size={14} className="text-slate-400 shrink-0" />
                  {selectedTags.length > 0 ? (
                    selectedTags.map((tagId) => {
                      const tag = tags.find((t) => t.id === tagId);
                      return tag ? (
                        <span
                          key={tagId}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                          style={{
                            backgroundColor: (tag.color || '#94a3b8') + '15',
                            borderColor: (tag.color || '#94a3b8') + '40',
                            color: tag.color || '#475569',
                          }}
                        >
                          {tag.name}
                        </span>
                      ) : null;
                    })
                  ) : (
                    <span className="text-slate-400">Nenhuma tag</span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isTagDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isTagDropdownOpen && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-[180px] overflow-y-auto">
                  {tags.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 text-center">Nenhuma tag cadastrada</p>
                  ) : (
                    tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setSelectedTags((prev) =>
                              isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                            );
                          }}
                          className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}
                        >
                          {isSelected ? (
                            <CheckSquare size={14} className="text-teal-600 shrink-0" />
                          ) : (
                            <Square size={14} className="text-slate-300 shrink-0" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color || '#94a3b8' }}
                          />
                          {tag.name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Checkbox Pago */}
            <div
              onClick={() => setIsPaid(!isPaid)}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                isPaid
                  ? 'bg-emerald-50 border-emerald-300 shadow-sm shadow-emerald-100'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              {isPaid ? (
                <CheckSquare size={22} className="text-emerald-600 shrink-0" />
              ) : (
                <Square size={22} className="text-slate-400 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-black ${isPaid ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {isPaid ? 'Pago / Confirmado' : 'Pendente'}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {isPaid ? 'Este lançamento será marcado como pago.' : 'Clique para marcar como pago.'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="px-5 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleDelete()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200"
            >
              <Trash2 size={14} />
              Excluir
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {isConfirming ? 'Confirmar' : 'Salvar'}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* Scope modal for recurrent */}
      <ModalOpcaoRecorrente
        isOpen={isScopeModalOpen}
        onClose={() => setIsScopeModalOpen(false)}
        onSelect={handleScopeSelect}
        type={scopeAction}
        modalidade={transaction?.modalidade === 'parcelada' ? 'parcelada' : 'recorrente'}
      />

      {/* Delete confirmation for unique */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Excluir Lançamento</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              Tem certeza que deseja excluir{' '}
              <strong className="text-slate-800 font-extrabold">"{transaction?.description}"</strong> de valor{' '}
              <strong className="text-rose-600 font-extrabold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction?.amount || 0)}
              </strong>
              ? Esta ação não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete('this')}
                disabled={loading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/30 transition-colors text-xs disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuickEditTransactionModal;

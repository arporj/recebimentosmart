import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Building2, Landmark, CreditCard, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { BRAZILIAN_BANKS, inferBankDomain } from '../../constants/banks';

interface QuickAddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (accountId: string) => void;
}



const QuickAddAccountModal: React.FC<QuickAddAccountModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('checking');
  const [bankName, setBankName] = useState('');
  const [bankIcon, setBankIcon] = useState('');
  const [saving, setSaving] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [showBankOptions, setShowBankOptions] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setType('checking');
      setBankName('');
      setBankIcon('');
      setBankSearch('');
    }
  }, [isOpen]);

  const filteredBanks = BRAZILIAN_BANKS.filter(b => 
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome da conta');
    if (!user) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .insert({
          user_id: user.id,
          name: name.trim(),
          type: type as any,
          initial_balance: 0,
          bank_name: bankName || null,
          bank_icon: bankIcon || null,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Conta criada com sucesso!');
      onSuccess(data.id);
      onClose();
    } catch (error: any) {
      toast.error('Erro ao criar conta: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
        <header className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-manrope">Nova Conta</h2>
            <p className="text-slate-400 text-xs mt-1">Cadastre rapidamente uma nova conta.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Conta</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Minha Conta Principal"
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'checking', label: 'Corrente', icon: Building2, color: 'text-blue-600' },
                { id: 'savings', label: 'Poupança', icon: Landmark, color: 'text-green-600' },
                { id: 'credit_card', label: 'Cartão', icon: CreditCard, color: 'text-purple-600' },
                { id: 'investment', label: 'Investimento', icon: TrendingUp, color: 'text-amber-600' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setType(item.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    type === item.id 
                    ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm' 
                    : 'border-slate-100 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <item.icon size={16} className={type === item.id ? 'text-teal-600' : item.color} />
                  <span className="text-xs font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Banco (Opcional)</label>
            <div className="relative">
              <input 
                type="text"
                value={bankSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setBankSearch(val);
                  setBankName(val);
                  setShowBankOptions(true);
                  
                  if (!val) {
                    setBankIcon('');
                  } else {
                    const officialBank = BRAZILIAN_BANKS.find(b => b.name.toLowerCase() === val.toLowerCase());
                    if (officialBank) {
                      setBankIcon(officialBank.domain);
                    } else {
                      setBankIcon(inferBankDomain(val));
                    }
                  }
                }}
                onFocus={() => setShowBankOptions(true)}
                placeholder="Pesquisar banco..."
                className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm transition-all"
              />
              {showBankOptions && bankSearch && (
                <div className="absolute z-10 bottom-full mb-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-48 overflow-y-auto p-2">
                  {filteredBanks.length > 0 ? (
                    filteredBanks.map(bank => (
                      <button
                        key={bank.domain}
                        type="button"
                        onClick={() => {
                          setBankName(bank.name);
                          setBankIcon(bank.domain);
                          setBankSearch(bank.name);
                          setShowBankOptions(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <img 
                          src={`https://www.google.com/s2/favicons?domain=${bank.domain}&sz=64`} 
                          alt={bank.name}
                          className="w-6 h-6 rounded-md shadow-sm"
                        />
                        <span className="text-sm font-medium text-slate-700">{bank.name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs text-slate-400 italic">Nenhum banco encontrado.</div>
                  )}
                </div>
              )}
            </div>
            
            {/* Input de site do banco customizado se não for da lista oficial */}
            {bankSearch && !BRAZILIAN_BANKS.some(b => b.name.toLowerCase() === bankSearch.toLowerCase()) && (
              <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-1 px-1">
                  <label className="text-[9px] font-bold text-teal-600 uppercase tracking-wider">Site/Domínio do Banco (para o ícone)</label>
                </div>
                <input 
                  type="text"
                  value={bankIcon}
                  onChange={e => setBankIcon(e.target.value.toLowerCase().trim())}
                  placeholder="Ex: portoseguro.com.br"
                  className="w-full px-4 py-2.5 bg-teal-50/50 border border-teal-100 rounded-xl focus:ring-1 focus:ring-teal-500/30 text-xs text-slate-600 placeholder-slate-400 transition-all"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:text-slate-900 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={saving}
              className="flex-[2] px-6 py-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-teal-600/20 transition-all disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar Conta'} <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddAccountModal;

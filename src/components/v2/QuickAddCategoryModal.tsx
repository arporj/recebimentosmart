import React, { useState, useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
}

interface QuickAddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (categoryId: string) => void;
  categories: Category[];
}

const QuickAddCategoryModal: React.FC<QuickAddCategoryModalProps> = ({ isOpen, onClose, onSuccess, categories: existingCategories }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setIcon('📁');
      setParentId('');
    }
  }, [isOpen]);

  const parentCategories = existingCategories.filter(c => !c.parent_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome da categoria');
    if (!user) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('financial_categories')
        .insert({
          user_id: user.id,
          name: name.trim(),
          icon: icon || null,
          parent_id: parentId || null
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Categoria criada com sucesso!');
      onSuccess(data.id);
      onClose();
    } catch (error: any) {
      toast.error('Erro ao criar categoria: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const emojiOptions = ['🏠','🍽️','🚗','🏥','📚','🎮','👕','📱','🌐','📋','💰','💻','📈','📦','🎉','✈️','🏋️','🎬','🎵','🐾','💊','🛒','🏦','⚡'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
        <header className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-manrope">Nova Categoria</h2>
            <p className="text-slate-400 text-xs mt-1">Cadastre rapidamente uma nova categoria.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Categoria</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Supermercado"
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Ícone</label>
            <div className="flex flex-wrap gap-2">
              {emojiOptions.map(emoji => (
                <button 
                  key={emoji} 
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                    icon === emoji ? 'bg-teal-600 shadow-lg scale-110' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Categoria Pai (Opcional)</label>
            <div className="relative">
              <select 
                value={parentId} 
                onChange={e => setParentId(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm appearance-none cursor-pointer"
              >
                <option value="">Nenhuma (Categoria Principal)</option>
                {parentCategories.map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>
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
              {saving ? 'Criando...' : 'Criar Categoria'} <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddCategoryModal;

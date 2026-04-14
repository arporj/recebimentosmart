import React, { useState } from 'react';
import { X, Tag, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface TagModalV2Props {
  onClose: () => void;
  onSuccess: (newTag: any) => void;
}

const COLORS = [
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Slate', value: '#64748b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Violet', value: '#8b5cf6' },
];

export function TagModalV2({ onClose, onSuccess }: TagModalV2Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0].value);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error('Informe o nome da tag');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_tags')
        .insert({
          user_id: user.id,
          name: name.trim(),
          color
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Tag criada com sucesso!');
      onSuccess(data);
      onClose();
    } catch (err: any) {
      toast.error('Erro ao criar tag: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        <header className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Nova Tag</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Tag</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Alimentação, Aluguel..."
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Cor</label>
            <div className="grid grid-cols-4 gap-3">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-full h-10 rounded-xl transition-all flex items-center justify-center ${color === c.value ? 'ring-2 ring-offset-2 ring-slate-900 scale-95 shadow-lg' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c.value }}
                >
                  {color === c.value && <Check size={18} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

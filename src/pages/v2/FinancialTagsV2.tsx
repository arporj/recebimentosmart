import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, ArrowRight, Check, Tag as TagIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../components/v2/ConfirmModal';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
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
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
];

const FinancialTagsV2 = () => {
  const { user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);

  // Form
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0].value);
  const [saving, setSaving] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const fetchTags = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financial_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) console.error(error);
    setTags(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, [user]);

  const resetForm = () => { setName(''); setColor(COLORS[0].value); setEditing(null); };
  const openNew = () => { resetForm(); setIsModalOpen(true); };
  const openEdit = (t: Tag) => {
    setEditing(t);
    setName(t.name);
    setColor(t.color || COLORS[0].value);
    setIsModalOpen(true);
  };

  const handleDelete = async (t: Tag) => {
    const { error } = await supabase.from('financial_tags').delete().eq('id', t.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Tag excluída!');
    setTagToDelete(null);
    fetchTags();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe o nome da tag.'); return; }

    setSaving(true);
    const payload = {
      user_id: user!.id,
      name: name.trim(),
      color,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('financial_tags').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('financial_tags').insert(payload));
    }

    if (error) { toast.error('Erro: ' + error.message); setSaving(false); return; }
    toast.success(editing ? 'Tag atualizada!' : 'Tag criada!');
    setIsModalOpen(false);
    resetForm();
    fetchTags();
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Tags</h1>
          <p className="text-slate-500 text-sm">Gerencie as tags para classificar suas transações.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20">
          <Plus size={18} /> Nova Tag
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 italic">Carregando...</div>
        ) : tags.length === 0 ? (
          <div className="py-12 text-center text-slate-400 italic">Nenhuma tag cadastrada.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tags.map(tag => (
              <div key={tag.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: (tag.color || '#64748b') + '20' }}
                >
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color || '#64748b' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{tag.name}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(tag)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setTagToDelete(tag)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); resetForm(); }} />
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden">
            <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TagIcon size={18} className="text-teal-600" />
                <h2 className="text-lg font-bold text-slate-900 font-manrope">{editing ? 'Editar Tag' : 'Nova Tag'}</h2>
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-500" /></button>
            </header>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome da Tag</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Alimentação, Aluguel..."
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                  autoFocus required
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cor</label>
                <div className="grid grid-cols-5 gap-3">
                  {COLORS.map(c => (
                    <button
                      key={c.value} type="button"
                      onClick={() => setColor(c.value)}
                      className={`w-full h-10 rounded-xl transition-all flex items-center justify-center ${
                        color === c.value ? 'ring-2 ring-offset-2 ring-slate-900 scale-95 shadow-lg' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.value }}
                    >
                      {color === c.value && <Check size={18} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {name.trim() && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Preview</label>
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-bold text-slate-700">{name.trim()}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 px-4 py-3 text-sm font-bold text-slate-400 hover:text-slate-900 transition-all rounded-xl">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all">
                  {saving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar')} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!tagToDelete}
        onClose={() => setTagToDelete(null)}
        onConfirm={() => tagToDelete && handleDelete(tagToDelete)}
        title="Excluir tag"
        message={<>Excluir a tag <strong>"{tagToDelete?.name}"</strong>?</>}
        confirmLabel="Excluir"
        confirmColor="red"
      />
    </div>
  );
};

export default FinancialTagsV2;

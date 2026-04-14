import { useState, useEffect } from 'react';
import { 
  Plus, Pencil, Trash2, X, ChevronRight, FolderOpen, Tag, 
  ArrowRight, ChevronDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
  created_at: string;
}

const FinancialCategoriesV2 = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  // Form
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financial_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) console.error(error);
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, [user]);

  // Seed default categories if none exist
  useEffect(() => {
    if (!loading && categories.length === 0 && user) {
      (async () => {
        await supabase.rpc('seed_default_categories', { p_user_id: user.id });
        await fetchCategories();
      })();
    }
  }, [loading, categories.length, user]);

  const parentCategories = categories.filter(c => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter(c => c.parent_id === parentId);

  const resetForm = () => { setName(''); setIcon(''); setParentId(''); setEditing(null); };
  const openNew = (presetParentId?: string) => { 
    resetForm(); 
    if (presetParentId) setParentId(presetParentId);
    setIsModalOpen(true); 
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setIcon(c.icon || '');
    setParentId(c.parent_id || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (c: Category) => {
    const children = getChildren(c.id);
    const msg = children.length > 0 
      ? `Esta categoria possui ${children.length} subcategoria(s). Excluir tudo?` 
      : 'Excluir esta categoria?';
    if (!confirm(msg)) return;
    const { error } = await supabase.from('financial_categories').delete().eq('id', c.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Categoria excluída!');
    fetchCategories();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe o nome.'); return; }

    setSaving(true);
    const payload = {
      user_id: user!.id,
      name: name.trim(),
      icon: icon || null,
      parent_id: parentId || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('financial_categories').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('financial_categories').insert(payload));
    }

    if (error) { toast.error('Erro: ' + error.message); setSaving(false); return; }
    toast.success(editing ? 'Categoria atualizada!' : 'Categoria criada!');
    setIsModalOpen(false);
    resetForm();
    fetchCategories();
    setSaving(false);
  };

  const emojiOptions = ['🏠','🍽️','🚗','🏥','📚','🎮','👕','📱','🌐','📋','💰','💻','📈','🔄','📦','🎉','✈️','🏋️','🎬','🎵','🐾','💊','🛒','🏦','⚡'];

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Categorias</h1>
          <p className="text-slate-500 text-sm">Organize suas transações por categorias e subcategorias.</p>
        </div>
        <button onClick={() => openNew()} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20">
          <Plus size={18} /> Nova Categoria
        </button>
      </div>

      {/* Lista hierárquica */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 italic">Carregando...</div>
        ) : parentCategories.length === 0 ? (
          <div className="py-12 text-center text-slate-400 italic">Nenhuma categoria. Aguarde o carregamento das categorias padrão...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {parentCategories.map(parent => {
              const children = getChildren(parent.id);
              return (
                <div key={parent.id}>
                  {/* Parent Row */}
                  <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                      {parent.icon || <FolderOpen size={18} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{parent.name}</p>
                      {children.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-medium">{children.length} subcategoria(s)</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openNew(parent.id)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Adicionar subcategoria">
                        <Plus size={15} />
                      </button>
                      <button onClick={() => openEdit(parent)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(parent)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Children */}
                  {children.map(child => (
                    <div key={child.id} className="flex items-center gap-4 pl-16 pr-6 py-3 hover:bg-slate-50/50 transition-colors group border-t border-slate-50">
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-sm shrink-0">
                        {child.icon || <Tag size={14} className="text-slate-300" />}
                      </div>
                      <p className="flex-1 text-sm text-slate-700 font-medium">{child.name}</p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(child)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(child)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); resetForm(); }} />
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden">
            <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 font-manrope">{editing ? 'Editar Categoria' : 'Nova Categoria'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-500" /></button>
            </header>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)} 
                  placeholder="Ex: Alimentação" 
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" 
                  required 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ícone (emoji)</label>
                <div className="flex flex-wrap gap-2">
                  {emojiOptions.map(emoji => (
                    <button 
                      key={emoji} type="button"
                      onClick={() => setIcon(emoji)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        icon === emoji ? 'bg-teal-600 shadow-lg scale-110' : 'bg-slate-100 hover:bg-slate-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {icon && (
                  <button type="button" onClick={() => setIcon('')} className="text-xs text-slate-400 hover:text-slate-600">
                    Remover ícone
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Categoria pai (opcional)</label>
                <div className="relative">
                  <select 
                    value={parentId} onChange={e => setParentId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm appearance-none cursor-pointer"
                    style={{ appearance: 'none' }}
                  >
                    <option value="">Nenhuma (categoria principal)</option>
                    {parentCategories
                      .filter(p => p.id !== editing?.id) // Não pode ser pai de si mesmo
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.icon || '📁'} {p.name}</option>
                      ))
                    }
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

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
    </div>
  );
};

export default FinancialCategoriesV2;

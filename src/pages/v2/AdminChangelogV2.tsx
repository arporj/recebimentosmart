import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, Edit2, Trash2, Calendar, RefreshCw, 
    Mail, Eye, Check, X, FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatToSP } from '../../lib/dates';
import { toast } from 'react-hot-toast';

interface Changelog {
    id: string;
    version: string;
    title: string;
    description: string;
    category: 'feature' | 'bugfix' | 'improvement';
    published_at: string;
    created_at: string;
}

// Conversor simples de Markdown para HTML em Javascript para visualização
function parseMarkdownToHtml(markdown: string): string {
    if (!markdown) return '';
    return markdown
        // Negrito
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Itálico
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Riscos
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Cabeçalhos (h3, h4)
        .replace(/^### (.*?)$/gm, '<h3 class="text-base font-bold text-slate-800 mt-4 mb-2">$1</h3>')
        .replace(/^#### (.*?)$/gm, '<h4 class="text-sm font-semibold text-slate-700 mt-3 mb-1">$1</h4>')
        // Listas
        .replace(/^- (.*?)$/gm, '<li class="ml-4 list-disc text-slate-600 mb-1">$1</li>')
        // Links
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-600 hover:underline">$1</a>')
        // Parágrafos e quebras de linha
        .split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('<li') || trimmed.startsWith('<h') || trimmed === '') {
                return line;
            }
            return `<p class="text-slate-600 mb-2 leading-relaxed text-sm">${line}</p>`;
        }).join('\n');
}

export default function AdminChangelogV2() {
    const navigate = useNavigate();
    const [changelogs, setChangelogs] = useState<Changelog[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Estados do Formulário/Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [version, setVersion] = useState('');
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<'feature' | 'bugfix' | 'improvement'>('feature');
    const [description, setDescription] = useState('');
    const [publishedAt, setPublishedAt] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchChangelogs();
    }, []);

    const fetchChangelogs = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('changelogs')
                .select('*')
                .order('published_at', { ascending: false });

            if (error) throw error;
            setChangelogs(data || []);
        } catch (error: unknown) {
            console.error('Erro ao buscar changelogs:', error);
            toast.error('Erro ao carregar os changelogs');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreateModal = () => {
        setEditingId(null);
        setVersion('');
        setTitle('');
        setCategory('feature');
        setDescription('');
        
        // Data atual formatada para o input datetime-local (yyyy-MM-ddThh:mm)
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
        setPublishedAt(localISOTime);
        
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (changelog: Changelog) => {
        setEditingId(changelog.id);
        setVersion(changelog.version);
        setTitle(changelog.title);
        setCategory(changelog.category);
        setDescription(changelog.description);
        
        // Converter published_at ISO para string do input datetime-local
        const date = new Date(changelog.published_at);
        const offset = date.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
        setPublishedAt(localISOTime);
        
        setIsModalOpen(true);
    };

    const handleDeleteChangelog = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta versão permanentemente? Isso removerá as confirmações de leitura dos usuários.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('changelogs')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Changelog excluído com sucesso!');
            fetchChangelogs();
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Erro ao deletar changelog:', err);
            toast.error(err.message || 'Erro ao deletar changelog');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!version.trim() || !title.trim() || !description.trim()) {
            toast.error('Preencha todos os campos obrigatórios');
            return;
        }

        try {
            setSubmitting(true);
            const dateISO = new Date(publishedAt).toISOString();

            const payload = {
                version: version.trim(),
                title: title.trim(),
                description: description.trim(),
                category,
                published_at: dateISO
            };

            if (editingId) {
                const { error } = await supabase
                    .from('changelogs')
                    .update(payload)
                    .eq('id', editingId);

                if (error) throw error;
                toast.success('Changelog atualizado com sucesso!');
            } else {
                const { error } = await supabase
                    .from('changelogs')
                    .insert(payload);

                if (error) throw error;
                toast.success('Novo changelog publicado com sucesso!');
            }

            setIsModalOpen(false);
            fetchChangelogs();
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Erro ao salvar changelog:', err);
            toast.error(err.message || 'Erro ao salvar changelog');
        } finally {
            setSubmitting(false);
        }
    };

    // Redireciona para tela de Broadcast passando o assunto e o HTML do changelog pré-configurado
    const handleRedirectToBroadcast = (changelog: Changelog) => {
        const emailContent = `
<h2>O que há de novo no Recebimento $mart! 🚀</h2>
<p>Olá, trazemos novidades quentinhas sobre a evolução da nossa plataforma na versão <strong>${changelog.version}</strong>:</p>
<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
<h3>${changelog.title}</h3>
${parseMarkdownToHtml(changelog.description)}
<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
<p>Se tiver alguma dúvida ou sugestão, responda este e-mail ou envie-nos um feedback direto pela plataforma!</p>
<p>Abraços,<br /><strong>Equipe Recebimento $mart</strong></p>
        `.trim();

        navigate('/v2/admin/broadcast', { 
            state: { 
                subject: `Novidades da versão ${changelog.version}: ${changelog.title}`,
                message: emailContent
            } 
        });
    };

    const getCategoryStyles = (cat: string) => {
        switch (cat) {
            case 'feature': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'bugfix': return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'improvement': return 'bg-sky-50 text-sky-700 border-sky-100';
            default: return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case 'feature': return 'Novidade';
            case 'bugfix': return 'Correção de Bug';
            case 'improvement': return 'Melhoria';
            default: return cat;
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-teal-500/10 rounded-xl text-teal-600">
                        <RefreshCw className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestão de Changelogs</h2>
                        <p className="text-slate-500">Cadastre atualizações e gerencie as novidades in-app exibidas aos usuários.</p>
                    </div>
                </div>
                <button
                    onClick={handleOpenCreateModal}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg flex-shrink-0"
                >
                    <Plus size={20} />
                    <span>Nova Versão</span>
                </button>
            </div>

            {/* Listagem */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    <span className="text-slate-500 font-medium mt-3">Carregando versões...</span>
                </div>
            ) : changelogs.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">Nenhum changelog publicado</h3>
                    <p className="text-slate-400 mt-2 font-medium">Cadastre a primeira atualização do sistema clicando no botão acima.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Versão</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Título</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Categoria</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Data de Publicação</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {changelogs.map(changelog => {
                                    const isScheduled = new Date(changelog.published_at) > new Date();
                                    return (
                                        <tr key={changelog.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-900 text-sm">{changelog.version}</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800 text-sm">{changelog.title}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${getCategoryStyles(changelog.category)}`}>
                                                    {getCategoryLabel(changelog.category)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={14} />
                                                    <span>{formatToSP(changelog.published_at)}</span>
                                                    {isScheduled && (
                                                        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-100 ml-1">
                                                            Agendado
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleRedirectToBroadcast(changelog)}
                                                        title="Criar E-mail de Broadcast"
                                                        className="p-2 border border-slate-100 hover:border-teal-100 rounded-lg text-slate-600 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                                    >
                                                        <Mail size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEditModal(changelog)}
                                                        title="Editar versão"
                                                        className="p-2 border border-slate-100 hover:border-blue-100 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteChangelog(changelog.id)}
                                                        title="Excluir versão"
                                                        className="p-2 border border-slate-100 hover:border-red-100 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal de Formulário (Nova Versão / Editar) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900">
                                {editingId ? 'Editar Versão do Changelog' : 'Cadastrar Nova Versão'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6">
                            {/* Inputs à Esquerda */}
                            <div className="flex-1 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Versão *</label>
                                        <input
                                            type="text"
                                            value={version}
                                            onChange={e => setVersion(e.target.value)}
                                            placeholder="Ex: v2.1.0"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-slate-800 text-sm font-semibold"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Categoria *</label>
                                        <select
                                            value={category}
                                            onChange={e => setCategory(e.target.value as 'feature' | 'bugfix' | 'improvement')}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-slate-800 text-sm font-semibold"
                                        >
                                            <option value="feature">Novidade (Feature)</option>
                                            <option value="improvement">Melhoria</option>
                                            <option value="bugfix">Correção de Bug</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Título da Atualização *</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="Ex: Apresentando o Assistente de Voz"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-slate-800 text-sm font-semibold"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Data de Publicação *</label>
                                    <input
                                        type="datetime-local"
                                        value={publishedAt}
                                        onChange={e => setPublishedAt(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-slate-800 text-sm font-semibold"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5 flex-1 flex flex-col">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Descrição (Markdown) *</label>
                                        <span className="text-[10px] text-slate-400 font-semibold">Suporta #, ##, ###, **, *, - listas</span>
                                    </div>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder={`### Added\n- Recurso A para facilidades\n- Recurso B\n\n### Changed\n- Ajustes em telas de cadastro\n\n### Fixed\n- Corrigido travamento no mobile`}
                                        className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-slate-800 text-sm font-medium resize-none min-h-[300px]"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Preview Lateral a Direita */}
                            <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-6 flex flex-col">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                                    <Eye size={14} />
                                    <span>Pré-visualização In-App</span>
                                </label>
                                
                                <div className="flex-1 bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 overflow-y-auto max-h-[480px] custom-scrollbar shadow-inner relative">
                                    {/* Simula a Gaveta Slide-over */}
                                    <div className="space-y-4">
                                        <div className="flex items-start justify-between">
                                            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded border border-teal-500/20">
                                                {getCategoryLabel(category)}
                                            </span>
                                            <span className="text-xs text-slate-400 font-bold">{version || 'vX.Y.Z'}</span>
                                        </div>
                                        
                                        <h4 className="text-md font-bold text-white leading-tight">
                                            {title || 'Título da Novidade'}
                                        </h4>
                                        
                                        <div className="text-slate-400 text-xs flex items-center gap-1">
                                            <Calendar size={12} />
                                            <span>{publishedAt ? formatToSP(new Date(publishedAt).toISOString()) : 'Hoje'}</span>
                                        </div>

                                        <hr className="border-slate-800 my-2" />

                                        {/* Conteúdo Renderizado */}
                                        <div 
                                            className="changelog-preview-content space-y-2 text-xs"
                                            dangerouslySetInnerHTML={{ 
                                                __html: parseMarkdownToHtml(description) || '<p class="text-slate-500 italic">Digite na descrição para ver a pré-visualização...</p>' 
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 rounded-b-3xl">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-500 font-bold transition-all text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all text-sm shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Check size={16} />
                                )}
                                <span>Salvar Versão</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

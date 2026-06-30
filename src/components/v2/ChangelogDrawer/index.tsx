import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, Gift, Mail, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatToSP } from '../../../lib/dates';

interface Changelog {
    id: string;
    version: string;
    title: string;
    description: string;
    category: 'feature' | 'bugfix' | 'improvement';
    published_at: string;
}

interface ChangelogDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    user: { id: string; email?: string } | null | undefined;
    isAdmin: boolean;
    onReadComplete?: () => void;
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
        .replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-slate-800 mt-4 mb-1.5">$1</h3>')
        .replace(/^#### (.*?)$/gm, '<h4 class="text-xs font-semibold text-slate-700 mt-2 mb-1">$1</h4>')
        // Listas
        .replace(/^- (.*?)$/gm, '<li class="ml-4 list-disc text-slate-600 mb-1 text-xs">$1</li>')
        // Links
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-600 hover:underline">$1</a>')
        // Parágrafos e quebras de linha
        .split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('<li') || trimmed.startsWith('<h') || trimmed === '') {
                return line;
            }
            return `<p class="text-slate-600 mb-1.5 leading-relaxed text-xs">${line}</p>`;
        }).join('\n');
}

export function ChangelogDrawer({ isOpen, onClose, user, isAdmin, onReadComplete }: ChangelogDrawerProps) {
    const navigate = useNavigate();
    const [changelogs, setChangelogs] = useState<Changelog[]>([]);
    const [loading, setLoading] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    const fetchChangelogsAndMarkAsRead = useCallback(async () => {
        if (!user) return;
        
        try {
            setLoading(true);
            
            // 1. Buscar todos os changelogs publicados
            const { data: changelogsData, error: clError } = await supabase
                .from('changelogs')
                .select('*')
                .lte('published_at', new Date().toISOString())
                .order('published_at', { ascending: false });

            if (clError) throw clError;
            const fetchedChangelogs = changelogsData || [];
            setChangelogs(fetchedChangelogs);

            if (fetchedChangelogs.length === 0) {
                setLoading(false);
                return;
            }

            // 2. Buscar quais changelogs o usuário já leu
            const { data: readData, error: readError } = await supabase
                .from('user_changelog_reads')
                .select('changelog_id')
                .eq('user_id', user.id);

            if (readError) throw readError;
            const readIds = (readData || []).map(r => r.changelog_id);

            // 3. Identificar quais changelogs NÃO foram lidos
            const unreadIds = fetchedChangelogs
                .filter(cl => !readIds.includes(cl.id))
                .map(cl => cl.id);

            // 4. Se houver não lidos, registrar a leitura em lote
            if (unreadIds.length > 0) {
                const inserts = unreadIds.map(id => ({
                    user_id: user.id,
                    changelog_id: id
                }));

                const { error: insertError } = await supabase
                    .from('user_changelog_reads')
                    .insert(inserts);

                if (insertError) {
                    console.error('Erro ao marcar changelogs como lidos:', insertError);
                } else {
                    // Notificar o componente pai para atualizar o badge (se a função foi passada)
                    if (onReadComplete) {
                        onReadComplete();
                    }
                }
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Erro ao gerenciar changelogs do usuário:', err.message);
        } finally {
            setLoading(false);
        }
    }, [user, onReadComplete]);

    useEffect(() => {
        if (isOpen) {
            fetchChangelogsAndMarkAsRead();
        }
    }, [isOpen, fetchChangelogsAndMarkAsRead]);

    // Fechar ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    const handleRedirectToBroadcast = (changelog: Changelog) => {
        onClose();
        
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

    const getCategoryBadge = (cat: string) => {
        switch (cat) {
            case 'feature':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'bugfix':
                return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'improvement':
                return 'bg-sky-50 text-sky-700 border-sky-100';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case 'feature': return 'Novidade';
            case 'bugfix': return 'Correção';
            case 'improvement': return 'Melhoria';
            default: return cat;
        }
    };

    return (
        <div 
            className={`fixed inset-0 z-[100] flex justify-end transition-opacity duration-300 ${
                isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
        >
            {/* Overlay */}
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all" />

            {/* Drawer Container */}
            <div 
                ref={drawerRef}
                className={`relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-100 transition-transform duration-300 transform ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-teal-500/10 rounded-lg text-teal-600">
                            <Gift size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-lg">O que há de novo?</h3>
                            <p className="text-[11px] text-slate-400 font-semibold">Atualizações e novidades do Recebimento $mart</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition-all border border-transparent hover:border-slate-100"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
                            <span className="text-xs font-semibold text-slate-500 mt-3">Carregando novidades...</span>
                        </div>
                    ) : changelogs.length === 0 ? (
                        <div className="text-center py-20 text-slate-400">
                            <Gift size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-semibold">Sem novidades no momento</p>
                            <p className="text-xs mt-1">Todas as atualizações do sistema aparecem por aqui.</p>
                        </div>
                    ) : (
                        changelogs.map(changelog => (
                            <div key={changelog.id} className="space-y-3 group">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${getCategoryBadge(changelog.category)}`}>
                                            {getCategoryLabel(changelog.category)}
                                        </span>
                                        <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                                            {changelog.version}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-semibold">
                                        <Calendar size={12} />
                                        <span>{formatToSP(changelog.published_at)}</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-start justify-between gap-4">
                                        <h4 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-teal-600 transition-colors">
                                            {changelog.title}
                                        </h4>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleRedirectToBroadcast(changelog)}
                                                title="Criar E-mail de Broadcast desta versão"
                                                className="opacity-0 group-hover:opacity-100 p-1 border border-slate-100 hover:border-teal-100 rounded-md text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-all flex-shrink-0"
                                            >
                                                <Mail size={12} />
                                            </button>
                                        )}
                                    </div>
                                    
                                    <div 
                                        className="changelog-drawer-html-content space-y-1.5 text-slate-600 leading-relaxed text-xs"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(changelog.description) }}
                                    />
                                </div>
                                <hr className="border-slate-100 pt-3" />
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold">Recebimento $mart v2.1.0</span>
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow"
                    >
                        <span>Entendido</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

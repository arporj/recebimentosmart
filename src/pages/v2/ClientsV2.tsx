import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, ArrowRight, User, Phone, Search, UserCheck, UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../components/v2/ConfirmModal';
import { ClientForm } from '../../components/ClientForm';
import type { Database } from '../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

const ClientsV2 = () => {
  const { user, rowDensity } = useAuth();
  const { checkLimit, refreshLimits } = usePlanLimits();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const fetchClients = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null) // Trazer apenas os não deletados
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Erro ao carregar clientes:', error);
        toast.error('Falha ao listar clientes.');
      } else {
        setClients(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [user?.id]);

  const openNew = () => {
    if (!checkLimit('clients')) return;
    setEditing(null);
    setIsModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setIsModalOpen(true);
  };

  const handleDelete = async (c: Client) => {
    try {
      // Soft Delete - Configurando a data de exclusão
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', c.id);

      if (error) {
        toast.error('Erro ao excluir: ' + error.message);
        return;
      }
      
      toast.success('Cliente removido com sucesso!');
      setClientToDelete(null);
      fetchClients();
      refreshLimits(); // Recarrega os limites após remoção
    } catch (err) {
      console.error(err);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  );

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie sua base de contatos e clientes no sistema.</p>
        </div>
        <button 
          onClick={openNew} 
          className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20 shrink-0"
        >
          <Plus size={18} /> Novo Cliente
        </button>
      </div>

      {/* Pesquisa e Filtros */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={18} className="text-slate-400" />
        </div>
        <input 
          type="text" 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full pl-11 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-700 transition-all shadow-sm"
        />
      </div>

      {/* Grid/Lista de Clientes */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <span className="text-sm font-medium">Carregando clientes...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400">
              <User size={28} />
            </div>
            <p className="text-slate-500 font-medium text-sm">
              {searchTerm ? 'Nenhum cliente encontrado na pesquisa.' : 'Nenhum cliente cadastrado ainda.'}
            </p>
            {!searchTerm && (
              <button 
                onClick={openNew}
                className="text-xs font-bold text-teal-600 hover:text-teal-700 underline uppercase tracking-wider"
              >
                Cadastrar meu primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Contato</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                          <User size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{client.name}</p>
                          <p className="text-slate-400 text-[10px] uppercase tracking-wider mt-0.5">
                            ID V2 {rowDensity === 'expanded' && client.status && ` · ATIVO`} {rowDensity === 'expanded' && !client.status && ` · INATIVO`}
                          </p>
                          {rowDensity === 'expanded' && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Status: {client.status ? 'Ativo no sistema' : 'Inativo no momento'} {client.phone ? `· Telefone: ${client.phone}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {client.phone ? (
                        <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                          <Phone size={14} className="text-slate-400" />
                          <span>{client.phone}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 italic">Sem telefone</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        client.status 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {client.status ? (
                          <>
                            <UserCheck size={12} />
                            Ativo
                          </>
                        ) : (
                          <>
                            <UserMinus size={12} />
                            Inativo
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 transition-opacity duration-200">
                        <button 
                          onClick={() => openEdit(client)} 
                          className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
                          title="Editar Cliente"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={() => setClientToDelete(client)} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="Excluir Cliente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro/Edição Completo */}
      {isModalOpen && (
        <ClientForm 
          client={editing || undefined} 
          onClose={() => {
            setIsModalOpen(false);
            setEditing(null);
            fetchClients(); // Recarrega a lista após alteração
            refreshLimits(); // Atualiza contadores
          }} 
        />
      )}

      <ConfirmModal
        isOpen={!!clientToDelete}
        onClose={() => setClientToDelete(null)}
        onConfirm={() => clientToDelete && handleDelete(clientToDelete)}
        title="Excluir Cliente"
        message={
          <div className="space-y-2">
            <p>Deseja realmente remover o cliente <strong className="text-slate-900">"{clientToDelete?.name}"</strong>?</p>
            <p className="text-xs text-slate-400 italic">Os históricos de lançamentos financeiros vinculados a este cliente não serão apagados, mas ele deixará de ser exibido nas listagens ativas.</p>
          </div>
        }
        confirmLabel="Remover Cliente"
        confirmColor="red"
      />
    </div>
  );
};

export default ClientsV2;

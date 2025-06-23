import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserCheck, UserX, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';

// Interface para o tipo de usuário
interface User {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    name?: string;
  };
  is_blocked?: boolean;
  is_paid?: boolean;
  last_payment_date?: string;
}

const AdminUserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);

  // Verificar se o usuário atual é administrador
  const isAdmin = currentUser?.email === 'arporj@gmail.com' || currentUser?.email === 'andre@andreric.com';

  // Carregar lista de usuários
  useEffect(() => {
    if (!isAdmin) {
      toast.error('Você não tem permissão para acessar esta página');
      return;
    }

    fetchUsers();
  }, [isAdmin]);

  // Filtrar usuários quando o termo de busca mudar
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(
        (user) =>
          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.user_metadata?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  // Buscar usuários do Supabase
  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Usar RPC para buscar usuários com informações de bloqueio e pagamento
      const { data, error } = await supabase.rpc('get_all_users_with_status');
      
      if (error) throw error;
      
      if (data) {
        setUsers(data);
        setFilteredUsers(data);
      }
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast.error('Erro ao carregar lista de usuários');
    } finally {
      setLoading(false);
    }
  };

  // Alternar status de bloqueio do usuário
  const toggleUserBlock = async (userId: string, isCurrentlyBlocked: boolean) => {
    try {
      // Usar RPC para bloquear/desbloquear usuário
      const { error } = await supabase.rpc(
        isCurrentlyBlocked ? 'unblock_user' : 'block_user',
        { p_user_id: userId }
      );
      
      if (error) throw error;
      
      // Atualizar estado local
      setUsers(
        users.map((user) =>
          user.id === userId ? { ...user, is_blocked: !isCurrentlyBlocked } : user
        )
      );
      
      toast.success(
        isCurrentlyBlocked
          ? 'Usuário desbloqueado com sucesso'
          : 'Usuário bloqueado com sucesso'
      );
    } catch (error) {
      console.error('Erro ao alterar status do usuário:', error);
      toast.error('Erro ao alterar status do usuário');
    }
  };

  // Se não for admin, não mostrar nada
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso Negado</h1>
        <p className="text-gray-700">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento de Usuários</h1>
      
      {/* Barra de pesquisa e botão de atualizar */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Buscar por email ou nome..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
        
        <button
          onClick={fetchUsers}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Lista
        </button>
      </div>
      
      {/* Tabela de usuários */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome / Email
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data de Cadastro
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status de Pagamento
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Último Pagamento
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-4 px-4 text-center text-gray-500">
                  Carregando usuários...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 px-4 text-center text-gray-500">
                  Nenhum usuário encontrado
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">
                        {user.user_metadata?.name || 'Sem nome'}
                      </span>
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_paid
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {user.is_paid ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500">
                    {user.last_payment_date
                      ? new Date(user.last_payment_date).toLocaleDateString('pt-BR')
                      : 'Nunca'}
                  </td>
                  <td className="py-4 px-4">
                    <button
                      onClick={() => toggleUserBlock(user.id, user.is_blocked || false)}
                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md ${
                        user.is_blocked
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                      disabled={user.email === currentUser?.email}
                      title={
                        user.email === currentUser?.email
                          ? 'Você não pode bloquear seu próprio usuário'
                          : user.is_blocked
                          ? 'Desbloquear usuário'
                          : 'Bloquear usuário'
                      }
                    >
                      {user.is_blocked ? (
                        <>
                          <UserCheck className="h-3 w-3 mr-1" />
                          Desbloquear
                        </>
                      ) : (
                        <>
                          <UserX className="h-3 w-3 mr-1" />
                          Bloquear
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUserManagement;

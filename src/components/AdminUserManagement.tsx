import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserCheck, UserX, RefreshCw, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';

// Interface para o tipo de usuário
interface User {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    name?: string;
  };
  email_confirmed_at?: string;
  last_sign_in_at?: string;
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

  // Buscar usuários do Supabase usando auth.admin
  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Como não temos acesso direto ao auth.admin no frontend,
      // vamos buscar usuários da tabela auth.users através de uma view ou função
      // Por enquanto, vamos simular com dados básicos disponíveis
      
      // Tentativa de buscar através de uma query simples
      const { data, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      // Como não podemos acessar todos os usuários diretamente do frontend por questões de segurança,
      // vamos mostrar apenas informações básicas e sugerir implementação no backend
      const mockUsers: User[] = [
        {
          id: currentUser?.id || '1',
          email: currentUser?.email || 'usuario@exemplo.com',
          created_at: currentUser?.created_at || new Date().toISOString(),
          user_metadata: {
            name: currentUser?.user_metadata?.name || 'Usuário Atual'
          },
          email_confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString()
        }
      ];
      
      setUsers(mockUsers);
      setFilteredUsers(mockUsers);
      
      toast.info('Funcionalidade limitada: Para gerenciar todos os usuários, é necessário implementar funções RPC no Supabase');
      
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast.error('Erro ao carregar lista de usuários');
    } finally {
      setLoading(false);
    }
  };

  // Se não for admin, não mostrar nada
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <UserX className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso Negado</h1>
          <p className="text-gray-700">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-6">
        <Users className="h-8 w-8 text-indigo-600 mr-3" />
        <h1 className="text-2xl font-bold text-gray-800">Gerenciamento de Usuários</h1>
      </div>
      
      {/* Aviso sobre funcionalidade */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Funcionalidade em Desenvolvimento
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Para implementar o gerenciamento completo de usuários, é necessário criar funções RPC no Supabase 
                que permitam acesso seguro aos dados de autenticação. Atualmente, apenas informações básicas estão disponíveis.
              </p>
            </div>
          </div>
        </div>
      </div>
      
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
                Email Confirmado
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Último Acesso
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
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
                        user.email_confirmed_at
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.email_confirmed_at ? 'Confirmado' : 'Pendente'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500">
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR')
                      : 'Nunca'}
                  </td>
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {user.email === currentUser?.email ? 'Você' : 'Ativo'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Instruções para implementação completa */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">
          Para implementar o gerenciamento completo de usuários:
        </h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Criar função RPC no Supabase para listar usuários</li>
          <li>• Implementar funções para bloquear/desbloquear usuários</li>
          <li>• Adicionar controle de permissões no backend</li>
          <li>• Configurar políticas de segurança (RLS) adequadas</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminUserManagement;

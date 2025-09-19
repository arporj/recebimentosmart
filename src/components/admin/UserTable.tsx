import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Search, Edit, Star, ArrowUp, ArrowDown } from 'lucide-react';
import EditUserModal from './EditUserModal';

// Interface atualizada para o perfil do usuário vindo da nova função RPC
export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  plan_name: string | null;
  subscription_status: string | null;
  subscription_end_date: string | null;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

const PlanBadge: React.FC<{ plan: string | null }> = ({ plan }) => {
  if (!plan) {
    return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Nenhum</span>;
  }

  const planLower = plan.toLowerCase();
  let colorClasses = 'bg-gray-100 text-gray-800';

  if (planLower === 'trial') {
    colorClasses = 'bg-yellow-100 text-yellow-800';
  } else if (planLower === 'pro' || planLower === 'premium') {
    colorClasses = 'bg-blue-100 text-blue-800';
  } else if (planLower === 'basico') {
    colorClasses = 'bg-green-100 text-green-800';
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses}`}>
      {plan.charAt(0).toUpperCase() + plan.slice(1)}
    </span>
  );
};

const StatusBadge: React.FC<{ status: string | null, isAdmin: boolean }> = ({ status, isAdmin }) => {
  if (isAdmin) {
    return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">Admin</span>;
  }
  if (!status) {
    return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 text-gray-800">-</span>;
  }

  const statusLower = status.toLowerCase();
  let colorClasses = 'bg-gray-100 text-gray-800';
  let text = status.charAt(0).toUpperCase() + status.slice(1)

  switch (statusLower) {
    case 'active':
      colorClasses = 'bg-green-100 text-green-800';
      text = 'Ativo';
      break;
    case 'trialing':
      colorClasses = 'bg-yellow-100 text-yellow-800';
      text = 'Em Teste';
      break;
    case 'canceled':
      colorClasses = 'bg-orange-100 text-orange-800';
      text = 'Cancelado';
      break;
    case 'expired':
    case 'past_due':
      colorClasses = 'bg-red-100 text-red-800';
      text = 'Expirado';
      break;
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses}`}>
      {text}
    </span>
  );
};


const UserTable = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof UserProfile; direction: 'ascending' | 'descending' } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Chama a nova função RPC que já inclui os dados da assinatura
      const { data, error } = await supabase.rpc('get_all_users_admin');
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar usuários:', error);
      toast.error(error.message || 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const sortedUsers = useMemo(() => {
    let filteredUsers = users;
    if (searchTerm) {
      filteredUsers = users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (sortConfig !== null) {
      return [...filteredUsers].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        // Tratamento para valores nulos
        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return sortConfig.direction === 'ascending' ? 1 : -1;
        if (bValue === null) return sortConfig.direction === 'ascending' ? -1 : 1;
        
        // Comparação baseada no tipo de dados
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        // Para valores booleanos
        if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          return sortConfig.direction === 'ascending' 
            ? (aValue === bValue ? 0 : aValue ? 1 : -1)
            : (aValue === bValue ? 0 : aValue ? -1 : 1);
        }
        
        // Fallback para outros tipos
        return sortConfig.direction === 'ascending' 
          ? (aValue > bValue ? 1 : -1) 
          : (aValue < bValue ? 1 : -1);
      });
    }
    
    return filteredUsers;
  }, [searchTerm, users, sortConfig]);

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  const handleUserUpdate = (updatedUser: UserProfile) => {
    setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    toast.success(`Usuário ${updatedUser.name || updatedUser.email} atualizado com sucesso!`);
    fetchUsers(); // Re-busca os dados para garantir consistência
  };
  
  const handleSort = (key: keyof UserProfile) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: keyof UserProfile) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    
    return sortConfig.direction === 'ascending' 
      ? <ArrowUp className="h-4 w-4 inline ml-1" /> 
      : <ArrowDown className="h-4 w-4 inline ml-1" />;
  };

  const handleMakePro = async (userId: string) => {
    if (!window.confirm('Deseja realmente tornar este usuário um cliente Pró por 30 dias?')) return;

    const toastId = toast.loading('Atualizando plano do usuário...');
    try {
      const { error } = await supabase.rpc('admin_set_user_plan', {
        user_id_to_update: userId,
        new_plan_name: 'Pro'
      });

      if (error) throw error;

      toast.success('Plano do usuário atualizado para Pró!', { id: toastId });
      fetchUsers(); // Re-busca a lista de usuários para refletir a mudança
    } catch (error: any) {
      console.error('Erro ao atualizar plano:', error);
      toast.error(error.message || 'Não foi possível atualizar o plano.', { id: toastId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full md:w-1/3">
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Usuário {getSortIcon('name')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('plan_name')}
              >
                Plano {getSortIcon('plan_name')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('subscription_status')}
              >
                Status {getSortIcon('subscription_status')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('subscription_end_date')}
              >
                Expira em {getSortIcon('subscription_end_date')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('last_sign_in_at')}
              >
                Último Login {getSortIcon('last_sign_in_at')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-4">Carregando...</td></tr>
            ) : sortedUsers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-4">Nenhum usuário encontrado.</td></tr>
            ) : (
              sortedUsers.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">{user.name || 'Não informado'}</span>
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PlanBadge plan={user.plan_name} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={user.subscription_status} isAdmin={user.is_admin} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString('pt-BR') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {!user.plan_name && !user.is_admin && (
                       <button 
                        onClick={() => handleMakePro(user.id)} 
                        className="text-green-600 hover:text-green-900 p-1 rounded-md hover:bg-green-100 transition-colors"
                        title="Tornar usuário Pró"
                      >
                        <Star className="h-5 w-5" />
                      </button>
                    )}
                    <button onClick={() => handleEditUser(user)} className="text-indigo-600 hover:text-indigo-900 p-1 rounded-md hover:bg-indigo-100 transition-colors" title="Editar Usuário">
                      <Edit className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <EditUserModal 
          user={selectedUser} 
          onClose={handleCloseModal} 
          onUserUpdate={handleUserUpdate}
        />
      )}
    </div>
  );
};

export default UserTable;
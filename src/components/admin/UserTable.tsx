import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Search, ArrowUp, ArrowDown, MoreVertical } from 'lucide-react';
import UserDetailsModal from './UserDetailsModal';

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
  valid_until: string | null;
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

  if (statusLower === 'active' || statusLower === 'ativo') {
    colorClasses = 'bg-green-100 text-green-800';
  } else if (statusLower === 'inactive' || statusLower === 'inativo') {
    colorClasses = 'bg-red-100 text-red-800';
  } else if (statusLower === 'pending' || statusLower === 'pendente') {
    colorClasses = 'bg-yellow-100 text-yellow-800';
  } else if (statusLower === 'canceled' || statusLower === 'cancelado') {
    colorClasses = 'bg-gray-100 text-gray-800';
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default function UserTable() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [sortField, setSortField] = useState<string>('last_sign_in_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_all_users_admin');

      if (error) {
        throw error;
      }

      setUsers(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro ao buscar usuários:', message);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const aValueOriginal = a[sortField as keyof UserProfile];
    const bValueOriginal = b[sortField as keyof UserProfile];

    // Handle null values
    if (aValueOriginal === null && bValueOriginal === null) return 0;
    if (aValueOriginal === null) return sortDirection === 'asc' ? 1 : -1;
    if (bValueOriginal === null) return sortDirection === 'asc' ? -1 : 1;

    let compareResult = 0;

    if (sortField === 'created_at' || sortField === 'last_sign_in_at' || sortField === 'valid_until') {
      const dateA = new Date(aValueOriginal as string).getTime();
      const dateB = new Date(bValueOriginal as string).getTime();
      compareResult = dateA - dateB;
    } else if (typeof aValueOriginal === 'string' && typeof bValueOriginal === 'string') {
      compareResult = aValueOriginal.localeCompare(bValueOriginal);
    } else if (typeof aValueOriginal === 'boolean' && typeof bValueOriginal === 'boolean') {
      compareResult = (aValueOriginal === bValueOriginal) ? 0 : aValueOriginal ? -1 : 1;
    } else {
      // Fallback
      if (aValueOriginal < bValueOriginal) compareResult = -1;
      else if (aValueOriginal > bValueOriginal) compareResult = 1;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

  const filteredUsers = sortedUsers.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (user.name?.toLowerCase().includes(searchLower) || '') ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.plan_name?.toLowerCase().includes(searchLower) || '')
    );
  });

  const handleOpenModal = (user: UserProfile) => {
    setSelectedUser(user);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  const handleUserUpdate = (updatedUser: UserProfile) => {
    setUsers(users.map(user => user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
    fetchUsers(); // Re-fetch to ensure data consistency
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <div className="flex flex-col flex-grow h-full">
      <div className="flex justify-end items-center mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar usuários..."
            className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>
      </div>

      <div className="overflow-auto flex-grow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer sticky top-0 bg-gray-50"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  Nome {getSortIcon('name')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer sticky top-0 bg-gray-50"
                onClick={() => handleSort('plan_name')}
              >
                <div className="flex items-center">
                  Plano {getSortIcon('plan_name')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer sticky top-0 bg-gray-50"
                onClick={() => handleSort('subscription_status')}
              >
                <div className="flex items-center">
                  Status {getSortIcon('subscription_status')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer sticky top-0 bg-gray-50"
                onClick={() => handleSort('last_sign_in_at')}
              >
                <div className="flex items-center">
                  Último login {getSortIcon('last_sign_in_at')}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center">
                  Carregando...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center">
                  Nenhum usuário encontrado
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.name || '-'}</div>
                    <div className="text-sm text-gray-500 md:hidden">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PlanBadge plan={user.plan_name} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={user.subscription_status} isAdmin={user.is_admin} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-100"
                      title="Ver Detalhes"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={handleCloseModal}
          onUserUpdate={handleUserUpdate}
        />
      )}
    </div>
  );
}
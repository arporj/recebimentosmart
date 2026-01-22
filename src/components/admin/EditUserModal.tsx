import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { X, Calendar, Shield } from 'lucide-react';
import { UserProfile } from './UserTable'; // Importa a interface

interface EditUserModalProps {
  user: UserProfile;
  onClose: () => void;
  onUserUpdate: (user: UserProfile) => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ user, onClose, onUserUpdate }) => {
  const [validUntil, setValidUntil] = useState(user.valid_until ? user.valid_until.split('T')[0] : '');
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [updating, setUpdating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      // Chama as funções RPC para atualizar os dados
      const { error: validityError } = await supabase.rpc('admin_update_user_validity', {
        p_user_id: user.id,
        new_valid_until: validUntil ? new Date(validUntil).toISOString() : null
      });
      if (validityError) throw validityError;

      const { error: adminStatusError } = await supabase.rpc('admin_update_user_admin_status', {
        p_user_id: user.id,
        p_is_admin: isAdmin
      });
      if (adminStatusError) throw adminStatusError;

      // Atualiza o estado local e fecha o modal
      onUserUpdate({ ...user, valid_until: validUntil, is_admin: isAdmin });
      onClose();

    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      const message = error instanceof Error ? error.message : 'Falha ao atualizar o usuário.';
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Editar Usuário</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <p className="font-medium text-gray-900">{user.name || 'Usuário sem nome'}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="valid-until" className="block text-sm font-medium text-gray-700 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Válido Até
            </label>
            <input 
              id="valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="is-admin" className="block text-sm font-medium text-gray-700 flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              Administrador
            </label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input 
                type="checkbox"
                id="is-admin"
                checked={isAdmin}
                onChange={() => setIsAdmin(!isAdmin)}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
              />
              <label htmlFor="is-admin" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
              Cancelar
            </button>
            <button type="submit" disabled={updating} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {updating ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUserModal;

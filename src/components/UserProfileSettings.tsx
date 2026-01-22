import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Save, User, Lock } from 'lucide-react'; // Import FileText icon
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'; // Import supabase

const UserProfileSettings = () => {
  const { user, loading, updateUserName, fetchReferralInfo } = useAuth(); // Add fetchReferralInfo
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentName, setCurrentName] = useState('');
  const [isEditingCpfCnpj, setIsEditingCpfCnpj] = useState(false);
  const [currentCpfCnpj, setCurrentCpfCnpj] = useState('');
  const [cpfCnpjError, setCpfCnpjError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Busca info inicial ou se o usuário mudar
    if (user) {
      setCurrentName(user.user_metadata?.name || '');
      // Fetch CPF/CNPJ from profiles table
      const fetchCpfCnpj = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('cpf_cnpj')
          .eq('id', user.id)
          .single();
        if (error) {
          console.error('Erro ao buscar CPF/CNPJ:', error);
          toast.error('Erro ao carregar CPF/CNPJ.');
        } else if (data && data.cpf_cnpj) {
          setCurrentCpfCnpj(data.cpf_cnpj);
        }
      };
      fetchCpfCnpj();
    }
  }, [user]);

  const handleSaveName = async () => {
    if (!currentName.trim()) {
      toast.error('Por favor, insira seu nome.');
      return;
    }
    try {
      await updateUserName(currentName.trim());
      setIsEditingName(false);
      toast.success('Nome atualizado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar o nome.');
    }
  };

  const handleSaveCpfCnpj = async () => {
    const cleanedCpfCnpj = currentCpfCnpj.replace(/[^0-9]/g, '');

    if (!cleanedCpfCnpj) {
      setCpfCnpjError('CPF/CNPJ é obrigatório.');
      return;
    }
    if (cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14) {
      setCpfCnpjError('CPF/CNPJ inválido. Deve conter 11 ou 14 dígitos.');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ cpf_cnpj: cleanedCpfCnpj })
        .eq('id', user?.id);

      if (error) throw error;

      setIsEditingCpfCnpj(false);
      toast.success('CPF/CNPJ atualizado com sucesso!');
      fetchReferralInfo(); // Refresh AuthContext to update profile data
    } catch (error) {
      console.error('Erro ao atualizar CPF/CNPJ:', error);
      toast.error('Erro ao atualizar CPF/CNPJ.');
    }
  };

  const handleChangePassword = () => {
    navigate('/change-password');
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md space-y-6">
      {/* Seção de Informações do Usuário */}
      <div>
        <div className="flex items-center mb-4">
          <User className="h-6 w-6 text-indigo-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-800">Minha Conta</h2>
        </div>
        
        {/* Campo de Nome */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          {isEditingName ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={currentName}
                onChange={(e) => setCurrentName(e.target.value)}
                placeholder="Digite seu nome"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <button
                onClick={handleSaveName}
                disabled={loading}
                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                <Save className="h-4 w-4 mr-1" />
                Salvar
              </button>
              <button
                onClick={() => {
                  setIsEditingName(false);
                  setCurrentName(user?.user_metadata?.name || '');
                }}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-gray-50">
              <span className="text-sm text-gray-700 truncate">
                {user?.user_metadata?.name || 'Não informado'}
              </span>
              <button
                onClick={() => setIsEditingName(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Alterar
              </button>
            </div>
          )}
        </div>
        
        {/* Campo de CPF/CNPJ */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">CPF ou CNPJ</label>
          {isEditingCpfCnpj ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={currentCpfCnpj}
                onChange={(e) => {
                  setCurrentCpfCnpj(e.target.value);
                  setCpfCnpjError(null);
                }}
                placeholder="Digite seu CPF ou CNPJ"
                className={`flex-1 px-3 py-2 border ${cpfCnpjError ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm`}
              />
              <button
                onClick={handleSaveCpfCnpj}
                disabled={loading}
                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                <Save className="h-4 w-4 mr-1" />
                Salvar
              </button>
              <button
                onClick={() => {
                  setIsEditingCpfCnpj(false);
                  setCurrentCpfCnpj(user?.user_metadata?.cpf_cnpj || ''); // Revert to original
                  setCpfCnpjError(null);
                }}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-gray-50">
              <span className="text-sm text-gray-700 truncate">
                {currentCpfCnpj || 'Não informado'}
              </span>
              <button
                onClick={() => setIsEditingCpfCnpj(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Alterar
              </button>
            </div>
          )}
          {cpfCnpjError && <p className="mt-2 text-sm text-red-600">{cpfCnpjError}</p>}
        </div>
        
        <div className="space-y-2 text-sm text-gray-600">
          <p><strong>Email:</strong> {user?.email}</p>
        </div>
        
        {/* Botão de Trocar Senha */}
        <div className="mt-4">
          <button
            onClick={handleChangePassword}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Lock className="h-4 w-4 mr-2" />
            Trocar Senha
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileSettings;

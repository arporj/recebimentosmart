import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Copy, Save, User, Link as LinkIcon, Key, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const UserProfileSettings = () => {
  const { user, referralCode, pixKey, fetchReferralInfo, updatePixKey, loading, updateUserName } = useAuth();
  const [currentPixKey, setCurrentPixKey] = useState('');
  const [isEditingPix, setIsEditingPix] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentName, setCurrentName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Busca info inicial ou se o usuário mudar
    if (user) {
      fetchReferralInfo();
      setCurrentName(user.user_metadata?.name || '');
    }
  }, [user, fetchReferralInfo]);

  useEffect(() => {
    // Atualiza o campo local quando a chave PIX do contexto mudar
    setCurrentPixKey(pixKey || '');
  }, [pixKey]);

  const referralLink = referralCode
    ? `${window.location.origin}/signup?ref=${referralCode}`
    : 'Gerando link...';

  const handleCopyLink = () => {
    if (referralCode) {
      navigator.clipboard.writeText(referralLink)
        .then(() => toast.success('Link de indicação copiado!'))
        .catch(() => toast.error('Não foi possível copiar o link'));
    } else {
      toast.error('Link ainda não disponível.');
    }
  };

  const handleSavePixKey = async () => {
    if (!currentPixKey.trim()) {
      toast.error('Por favor, insira sua chave PIX.');
      return;
    }
    try {
      await updatePixKey(currentPixKey.trim());
      setIsEditingPix(false);
    } catch (error) {
      // O erro já é tratado no AuthContext
    }
  };

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
      toast.error('Erro ao atualizar o nome.');
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

      {/* Seção de Link de Indicação */}
      <div>
        <div className="flex items-center mb-4">
          <LinkIcon className="h-6 w-6 text-green-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-800">Indique e Ganhe</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Compartilhe seu link de indicação. Para cada amigo que se cadastrar e pagar a primeira mensalidade, você ganha R$ 5,00 de crédito!
        </p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={referralLink}
            readOnly
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
          />
          <button
            onClick={handleCopyLink}
            disabled={!referralCode || loading}
            className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copiar
          </button>
        </div>
      </div>

      {/* Seção de Chave PIX */}
      <div>
        <div className="flex items-center mb-4">
          <Key className="h-6 w-6 text-blue-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-800">Chave PIX para Recebimento</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Cadastre sua chave PIX para receber pagamentos caso seus créditos de indicação ultrapassem o valor da mensalidade.
        </p>
        {isEditingPix ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={currentPixKey}
              onChange={(e) => setCurrentPixKey(e.target.value)}
              placeholder="Digite sua chave PIX (CPF, CNPJ, Celular, Email ou Aleatória)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <button
              onClick={handleSavePixKey}
              disabled={loading}
              className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
            >
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </button>
            <button
              onClick={() => {
                setIsEditingPix(false);
                setCurrentPixKey(pixKey || ''); // Restaura valor original
              }}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-gray-50">
            <span className="text-sm text-gray-700 truncate">
              {pixKey ? `Chave cadastrada: ${pixKey}` : 'Nenhuma chave PIX cadastrada.'}
            </span>
            <button
              onClick={() => setIsEditingPix(true)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {pixKey ? 'Alterar' : 'Cadastrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileSettings;

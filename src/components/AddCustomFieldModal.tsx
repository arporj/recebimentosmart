import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { X, Save } from 'lucide-react';

interface AddCustomFieldModalProps {
  onClose: () => void;
  onSave: (newField: { id: string; name: string }) => void;
}

export function AddCustomFieldModal({ onClose, onSave }: AddCustomFieldModalProps) {
  const [fieldName, setFieldName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!fieldName.trim()) {
      toast.error('O nome do campo não pode estar vazio.');
      return;
    }

    setIsLoading(true);

    try {
      // Obter o usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }
      
      const { data: newField, error } = await supabase
        .from('custom_fields')
        .insert({ name: fieldName, type: 'text', user_id: user.id })
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast.success('Campo personalizado adicionado com sucesso!');
      onSave(newField);
      onClose();
    } catch (error: any) {
      toast.error(`Erro ao adicionar campo: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Adicionar Novo Campo</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        <div>
          <label htmlFor="field-name" className="block text-sm font-medium text-gray-700">
            Nome do Campo
          </label>
          <input
            id="field-name"
            type="text"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Ex: Chave Pix"
          />
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="bg-custom text-white px-4 py-2 rounded-md hover:bg-custom-hover flex items-center"
            disabled={isLoading}
          >
            <Save size={18} className="mr-2" />
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
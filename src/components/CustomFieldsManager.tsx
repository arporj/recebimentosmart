import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { PlusCircle, Trash2, Edit, Save, X } from 'lucide-react';
import type { Database } from '../types/supabase';

type CustomField = Database['public']['Tables']['custom_fields']['Row'];

export function CustomFieldsManager() {
  const { user } = useAuth();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [editingFieldName, setEditingFieldName] = useState('');

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar campos personalizados.');
    } else {
      setFields(data);
    }
  };

  const handleAddField = async () => {
    if (newFieldName.trim() === '' || !user) return;

    const { data, error } = await supabase
      .from('custom_fields')
      .insert([{ name: newFieldName.trim(), user_id: user.id }])
      .select()
      .single();

    if (error) {
      toast.error(`Erro ao adicionar campo: ${error.message}`);
    } else if (data) {
      setFields([...fields, data]);
      setNewFieldName('');
      toast.success('Campo adicionado com sucesso!');
    }
  };

  const handleDeleteField = async (id: number) => {
    const { error } = await supabase.from('custom_fields').delete().eq('id', id);

    if (error) {
      toast.error('Erro ao excluir campo.');
    } else {
      setFields(fields.filter((field) => field.id !== id));
      toast.success('Campo excluído com sucesso!');
    }
  };

  const handleUpdateField = async () => {
    if (!editingField || editingFieldName.trim() === '' || !user) return;

    const { data, error } = await supabase
      .from('custom_fields')
      .update({ name: editingFieldName.trim() })
      .eq('id', editingField.id)
      .select()
      .single();

    if (error) {
      toast.error(`Erro ao atualizar campo: ${error.message}`);
    } else if (data) {
      setFields(fields.map(f => f.id === data.id ? data : f));
      setEditingField(null);
      setEditingFieldName('');
      toast.success('Campo atualizado com sucesso!');
    }
  };

  const startEditing = (field: CustomField) => {
    setEditingField(field);
    setEditingFieldName(field.name);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditingFieldName('');
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow border border-secondary-100">
      <h2 className="text-lg font-medium mb-4 text-neutral-800">Gerenciar Campos Personalizados</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          placeholder="Nome do novo campo"
          className="flex-grow mt-1 block w-full rounded-md border-secondary-200 shadow-sm focus:border-accent-500 focus:ring-accent-500 sm:text-sm"
        />
        <button
          onClick={handleAddField}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-accent-600 hover:bg-accent-700"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.id} className="flex items-center justify-between p-2 rounded-md bg-neutral-50 border border-secondary-100">
            {editingField?.id === field.id ? (
              <div className="flex-grow flex gap-2">
                <input
                  type="text"
                  value={editingFieldName}
                  onChange={(e) => setEditingFieldName(e.target.value)}
                  className="flex-grow mt-1 block w-full rounded-md border-secondary-200 shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                />
                <button onClick={handleUpdateField} className="p-2 text-secondary-600 hover:text-secondary-800"><Save className="h-5 w-5" /></button>
                <button onClick={cancelEditing} className="p-2 text-neutral-500 hover:text-neutral-700"><X className="h-5 w-5" /></button>
              </div>
            ) : (
              <span className="text-sm font-medium text-neutral-800">{field.name}</span>
            )}
            <div className="flex items-center gap-2">
                <button onClick={() => startEditing(field)} className="p-2 text-accent-600 hover:text-accent-800"><Edit className="h-5 w-5" /></button>
                <button onClick={() => handleDeleteField(field.id)} className="p-2 text-red-600 hover:text-red-800"><Trash2 className="h-5 w-5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
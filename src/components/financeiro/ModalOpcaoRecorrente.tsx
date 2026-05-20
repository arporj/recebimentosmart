import React from 'react';
import { X, Calendar, Layers, Hash } from 'lucide-react';

interface ModalOpcaoRecorrenteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (scope: 'this' | 'following' | 'all') => void;
  type: 'edit' | 'delete';
  modalidade: 'parcelada' | 'recorrente';
}

export const ModalOpcaoRecorrente: React.FC<ModalOpcaoRecorrenteProps> = ({
  isOpen,
  onClose,
  onSelect,
  type,
  modalidade
}) => {
  if (!isOpen) return null;

  const title = type === 'edit' ? 'Editar Transação' : 'Excluir Transação';
  const subtitle = modalidade === 'parcelada' 
    ? 'Esta transação faz parte de um parcelamento.' 
    : 'Esta transação faz parte de uma recorrência.';

  const options = [
    {
      id: 'this',
      title: type === 'edit' ? 'Somente este' : 'Excluir apenas este',
      description: 'As outras parcelas/ocorrências não serão afetadas.',
      icon: Hash,
    },
    {
      id: 'following',
      title: type === 'edit' ? 'Este e os futuros' : 'Excluir este e os futuros',
      description: 'Afeta este e todos os futuros deste grupo.',
      icon: Calendar,
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            O que você deseja fazer?
          </p>
          
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id as any)}
              className="w-full flex items-start p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all group text-left"
            >
              <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                <opt.icon className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="font-semibold text-gray-900 group-hover:text-blue-700">{opt.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

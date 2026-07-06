import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Check, Smile, Utensils, Car, ShoppingBag, HeartPulse, Briefcase, DollarSign, Sparkles } from 'lucide-react';

interface CategoryIconPickerV2Props {
  value: string | null;
  onChange: (icon: string | null) => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: { emoji: string; name: string; keywords: string[] }[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'finance',
    name: 'Finanças & Negócios',
    icon: <DollarSign size={18} />,
    emojis: [
      { emoji: '💰', name: 'Saco de Dinheiro', keywords: ['dinheiro', 'saldo', 'riqueza', 'grana'] },
      { emoji: '💵', name: 'Nota de Dólar', keywords: ['nota', 'cifrão', 'pagamento'] },
      { emoji: '💶', name: 'Nota de Euro', keywords: ['euro', 'moeda', 'cambio'] },
      { emoji: '💷', name: 'Nota de Libra', keywords: ['libra', 'moeda'] },
      { emoji: '🪙', name: 'Moeda', keywords: ['moeda', 'trocado', 'investimento'] },
      { emoji: '💳', name: 'Cartão de Crédito', keywords: ['cartao', 'credito', 'debito', 'banco'] },
      { emoji: '🏦', name: 'Banco', keywords: ['banco', 'instituicao', 'agencia'] },
      { emoji: '📈', name: 'Gráfico Subindo', keywords: ['lucro', 'investimento', 'rendimento', 'bolsa'] },
      { emoji: '📉', name: 'Gráfico Descendo', keywords: ['prejuizo', 'queda', 'gasto'] },
      { emoji: '📊', name: 'Gráfico de Barras', keywords: ['relatorio', 'estatistica', 'metas'] },
      { emoji: '🧾', name: 'Recibo', keywords: ['recibo', 'nota fiscal', 'comprovante', 'fatura'] },
      { emoji: '🔐', name: 'Cofre Trancado', keywords: ['cofre', 'reserva', 'poupanca'] },
      { emoji: '🛍️', name: 'Sacola de Compras', keywords: ['compras', 'loja', 'gastos'] },
      { emoji: '📱', name: 'Pix / Celular', keywords: ['pix', 'celular', 'transferencia'] },
      { emoji: '💎', name: 'Diamante', keywords: ['patrimonio', 'luxo', 'investimento'] },
      { emoji: '🏧', name: 'Caixa Eletrônico', keywords: ['saque', 'caixa', 'banco'] },
      { emoji: '🏷️', name: 'Etiqueta', keywords: ['tag', 'promocao', 'desconto'] },
      { emoji: '📜', name: 'Contrato', keywords: ['documento', 'termo', 'servico'] },
    ]
  },
  {
    id: 'food_drink',
    name: 'Comidas & Bebidas',
    icon: <Utensils size={18} />,
    emojis: [
      { emoji: '🍺', name: 'Cerveja', keywords: ['cerveja', 'chopp', 'bar', 'bebida', 'lazer'] },
      { emoji: '🍻', name: 'Canecas de Cerveja', keywords: ['chopp', 'cervejas', 'brinde', 'happy hour'] },
      { emoji: '🍷', name: 'Vinho', keywords: ['vinho', 'tinto', 'jantar', 'bebida'] },
      { emoji: '🍸', name: 'Coquetel', keywords: ['drink', 'coquetel', 'balada', 'festa'] },
      { emoji: '🍹', name: 'Drink Tropical', keywords: ['caipirinha', 'suco', 'praia'] },
      { emoji: '☕', name: 'Café', keywords: ['cafe', 'expresso', 'padaria', 'cafezinho'] },
      { emoji: '🧃', name: 'Caixa de Suco', keywords: ['suco', 'bebida', 'lanche'] },
      { emoji: '🥤', name: 'Refrigerante / Copo', keywords: ['refri', 'refrigerante', 'fast food'] },
      { emoji: '🍽️', name: 'Prato e Talheres', keywords: ['restaurante', 'almoco', 'jantar', 'comida'] },
      { emoji: '🍕', name: 'Pizza', keywords: ['pizza', 'delivery', 'lanche', 'ifood'] },
      { emoji: '🍔', name: 'Hambúrguer', keywords: ['hamburguer', 'fast food', 'lanche'] },
      { emoji: '🍟', name: 'Batata Frita', keywords: ['batata', 'lanche', 'petisco'] },
      { emoji: '🌭', name: 'Cachorro Quente', keywords: ['hot dog', 'lanche'] },
      { emoji: '🥩', name: 'Carne / Churrasco', keywords: ['churrasco', 'carne', 'acougue'] },
      { emoji: '🍣', name: 'Sushi / Japa', keywords: ['sushi', 'comida japonesa', 'peixe'] },
      { emoji: '🥗', name: 'Salada', keywords: ['saudavel', 'fit', 'marmita'] },
      { emoji: '🍞', name: 'Pão / Padaria', keywords: ['pao', 'padaria', 'cafe da manha'] },
      { emoji: '🛒', name: 'Carrinho de Mercado', keywords: ['mercado', 'supermercado', 'compras'] },
      { emoji: '🍫', name: 'Chocolate', keywords: ['doce', 'chocolate', 'sobremesa'] },
      { emoji: '🍦', name: 'Sorvete', keywords: ['sorvete', 'acai', 'doce'] },
    ]
  },
  {
    id: 'transport',
    name: 'Transporte & Viagens',
    icon: <Car size={18} />,
    emojis: [
      { emoji: '🚗', name: 'Carro', keywords: ['carro', 'automovel', 'veiculo'] },
      { emoji: '🚘', name: 'Carro Frente', keywords: ['uber', 'taxi', 'transporte'] },
      { emoji: '⛽', name: 'Bomba de Gasolina', keywords: ['combustivel', 'gasolina', 'alcool', 'posto'] },
      { emoji: '🛵', name: 'Moto / Delivery', keywords: ['moto', 'entrega', 'ifood', 'motoboy'] },
      { emoji: '🚲', name: 'Bicicleta', keywords: ['bike', 'bicicleta', 'esporte'] },
      { emoji: '🚌', name: 'Ônibus', keywords: ['onibus', 'transporte publico', 'passagem'] },
      { emoji: '🚇', name: 'Metrô', keywords: ['metro', 'trem', 'transporte'] },
      { emoji: '✈️', name: 'Avião', keywords: ['aviao', 'voo', 'viagem', 'passagem'] },
      { emoji: '🧳', name: 'Mala de Viagem', keywords: ['mala', 'viagem', 'ferias', 'hotel'] },
      { emoji: '🚕', name: 'Táxi / Uber', keywords: ['taxi', 'uber', 'corrida'] },
      { emoji: '🛠️', name: 'Oficina / Manutenção', keywords: ['oficina', 'mecanico', 'manutencao', 'revisao'] },
      { emoji: '🛑', name: 'Pare / Pedágio', keywords: ['pedagio', 'multa', 'transito'] },
      { emoji: '🅿️', name: 'Estacionamento', keywords: ['estacionamento', 'vaga', 'valet'] },
      { emoji: '🚢', name: 'Navio / Cruzeiro', keywords: ['navio', 'cruzeiro', 'mar'] },
    ]
  },
  {
    id: 'home_lifestyle',
    name: 'Casa & Utilidades',
    icon: <ShoppingBag size={18} />,
    emojis: [
      { emoji: '🏠', name: 'Casa', keywords: ['casa', 'aluguel', 'moradia', 'condominio'] },
      { emoji: '🏢', name: 'Apartamento / Prédio', keywords: ['apartamento', 'predio', 'condominio'] },
      { emoji: '⚡', name: 'Energia / Luz', keywords: ['luz', 'energia', 'eletricidade', 'conta'] },
      { emoji: '💧', name: 'Gota / Água', keywords: ['agua', 'saneamento', 'conta'] },
      { emoji: '🔥', name: 'Gás / Fogo', keywords: ['gas', 'cozinha', 'aquecimento'] },
      { emoji: '🌐', name: 'Internet / Wi-Fi', keywords: ['internet', 'wifi', 'fibra', 'provedor'] },
      { emoji: '📺', name: 'TV / Streaming', keywords: ['tv', 'netflix', 'cable', 'streaming'] },
      { emoji: '🧹', name: 'Limpeza / Diarista', keywords: ['limpeza', 'diarista', 'faxina', 'produtos'] },
      { emoji: '🛋️', name: 'Móveis / Sofá', keywords: ['sofa', 'moveis', 'decoracao', 'casa'] },
      { emoji: '🔧', name: 'Reparos / Chaveiro', keywords: ['reparo', 'manutencao', 'reforma'] },
      { emoji: '🚬', name: 'Cigarro / Tabacaria', keywords: ['cigarro', 'fumo', 'tabacaria', 'vape', 'charuto'] },
      { emoji: '👕', name: 'Roupas / Vestuário', keywords: ['roupa', 'vestuario', 'vestido', 'compras'] },
      { emoji: '👟', name: 'Tênis / Calçado', keywords: ['tenis', 'sapato', 'calcado'] },
      { emoji: '💄', name: 'Cosméticos / Beleza', keywords: ['maquiagem', 'beleza', 'salao', 'estetica'] },
      { emoji: '✂️', name: 'Cabeleireiro / Barbeiro', keywords: ['corte', 'cabelo', 'barba', 'salao'] },
    ]
  },
  {
    id: 'health_pet',
    name: 'Saúde & Pets',
    icon: <HeartPulse size={18} />,
    emojis: [
      { emoji: '🏥', name: 'Hospital / Clínica', keywords: ['hospital', 'clinica', 'consulta'] },
      { emoji: '💊', name: 'Remédio / Farmácia', keywords: ['remedio', 'farmacia', 'medicamento'] },
      { emoji: '🩺', name: 'Estetoscópio / Médico', keywords: ['medico', 'plano de saude', 'consulta'] },
      { emoji: '🦷', name: 'Dente / Dentista', keywords: ['dentista', 'odonto', 'dente'] },
      { emoji: '👓', name: 'Óculos / Ótica', keywords: ['oculos', 'otica', 'lente'] },
      { emoji: '🏋️', name: 'Academia / Musculação', keywords: ['academia', 'gym', 'fitness', 'treino'] },
      { emoji: '🐕', name: 'Cachorro / Pet', keywords: ['cachorro', 'dog', 'pet', 'racao'] },
      { emoji: '🐈', name: 'Gato', keywords: ['gato', 'cat', 'pet', 'veterinario'] },
      { emoji: '🐾', name: 'Patas / Petshop', keywords: ['petshop', 'veterinario', 'banho e tosa'] },
    ]
  },
  {
    id: 'leisure_events',
    name: 'Lazer & Eventos',
    icon: <Sparkles size={18} />,
    emojis: [
      { emoji: '🎉', name: 'Festa / Comemoração', keywords: ['festa', 'aniversario', 'evento'] },
      { emoji: '🎬', name: 'Cinema / Filme', keywords: ['cinema', 'filme', 'pipoca', 'ingressos'] },
      { emoji: '🎮', name: 'Video Game', keywords: ['game', 'jogos', 'playstation', 'xbox'] },
      { emoji: '🎵', name: 'Música / Shows', keywords: ['musica', 'show', 'spotify', 'ingresso'] },
      { emoji: '⚽', name: 'Futebol / Esporte', keywords: ['futebol', 'jogo', 'esporte', 'ingresso'] },
      { emoji: '🎟️', name: 'Ingresso / Ticket', keywords: ['ingresso', 'evento', 'teatro'] },
      { emoji: '🎁', name: 'Presente', keywords: ['presente', 'aniversario', 'mimo'] },
      { emoji: '📚', name: 'Livros / Leitura', keywords: ['livro', 'leitura', 'estudo'] },
      { emoji: '🏖️', name: 'Praia / Férias', keywords: ['praia', 'ferias', 'viagem', 'verao'] },
      { emoji: '📸', name: 'Fotografia / Câmera', keywords: ['foto', 'camera', 'ensaio'] },
    ]
  },
  {
    id: 'work_education',
    name: 'Trabalho & Estudos',
    icon: <Briefcase size={18} />,
    emojis: [
      { emoji: '💼', name: 'Pasta / Trabalho', keywords: ['trabalho', 'emprego', 'salario', 'bossa'] },
      { emoji: '💻', name: 'Notebook / Computador', keywords: ['notebook', 'computador', 'tecnologia', 'freelance'] },
      { emoji: '🎓', name: 'Graduação / Faculdade', keywords: ['faculdade', 'curso', 'pos', 'diploma'] },
      { emoji: '🖊️', name: 'Caneta / Papelaria', keywords: ['papelaria', 'material', 'escritorio'] },
      { emoji: '📋', name: 'Prancheta / Tarefas', keywords: ['tarefas', 'planejamento', 'projeto'] },
      { emoji: '⏰', name: 'Relógio / Ponto', keywords: ['tempo', 'horas', 'ponto'] },
      { emoji: '📬', name: 'Correios / Encomenda', keywords: ['correios', 'frete', 'entrega', 'encomenda'] },
    ]
  },
  {
    id: 'expressions_symbols',
    name: 'Expressões & Símbolos',
    icon: <Smile size={18} />,
    emojis: [
      { emoji: '⭐', name: 'Estrela', keywords: ['estrela', 'favorito', 'destaque'] },
      { emoji: '❤️', name: 'Coração', keywords: ['coracao', 'amor', 'doacao'] },
      { emoji: '✅', name: 'Check Verde', keywords: ['ok', 'concluido', 'pago'] },
      { emoji: '🔄', name: 'Recorrência', keywords: ['recorrente', 'assinatura', 'mensal'] },
      { emoji: '⚠️', name: 'Alerta / Aviso', keywords: ['alerta', 'urgente', 'importante'] },
      { emoji: '📌', name: 'Tachinha / Fixo', keywords: ['fixo', 'importante', 'marcador'] },
      { emoji: '🎯', name: 'Alvo / Meta', keywords: ['meta', 'objetivo', 'desafio'] },
      { emoji: '💡', name: 'Ideia / Lâmpada', keywords: ['ideia', 'inovacao', 'projeto'] },
      { emoji: '✨', name: 'Brilhos', keywords: ['novo', 'especial', 'destaque'] },
      { emoji: '😃', name: 'Sorriso', keywords: ['feliz', 'pessoal'] },
    ]
  }
];

export const CategoryIconPickerV2: React.FC<CategoryIconPickerV2Props> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('finance');
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Search filter across ALL emojis
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const results: { emoji: string; name: string }[] = [];

    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesKeyword = item.keywords.some(k => k.toLowerCase().includes(q));
        if (matchesName || matchesKeyword) {
          results.push({ emoji: item.emoji, name: item.name });
        }
      }
    }
    return results;
  }, [searchQuery]);

  const activeCategory = useMemo(() => {
    return EMOJI_CATEGORIES.find(c => c.id === activeTab) || EMOJI_CATEGORIES[0];
  }, [activeTab]);

  const handleSelectEmoji = (emoji: string) => {
    onChange(emoji);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClearIcon = () => {
    onChange(null);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      {/* Trigger Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`group flex items-center justify-center gap-2.5 px-4 py-3 bg-slate-50 border border-slate-200 hover:border-teal-500 rounded-2xl transition-all shadow-sm hover:shadow ${
            value ? 'text-2xl' : 'text-slate-400 text-sm font-semibold'
          }`}
          title="Clique para escolher um ícone/emoji"
        >
          <span className="transition-transform group-hover:scale-110 duration-200">
            {value || '😀 Escolher Ícone'}
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-md group-hover:text-teal-700 group-hover:bg-teal-50 transition-colors">
            Alterar
          </span>
        </button>

        {value && (
          <button
            type="button"
            onClick={handleClearIcon}
            className="text-xs font-bold text-slate-400 hover:text-rose-600 px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          >
            Remover
          </button>
        )}
      </div>

      {/* WhatsApp-Style Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Top Header & Search Bar */}
          <div className="p-3 bg-slate-50/80 border-b border-slate-100 space-y-2">
            <div className="relative flex items-center">
              <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar ícone... (ex: cerveja, chopp, cigarro, uber)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category Tabs (Horizontal Scroll) */}
            {!searchQuery && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 scroll-smooth">
                {EMOJI_CATEGORIES.map(cat => {
                  const isActive = activeTab === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveTab(cat.id)}
                      className={`flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        isActive
                          ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 scale-105'
                          : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-800'
                      }`}
                      title={cat.name}
                    >
                      {cat.icon}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Emoji Grid Area */}
          <div className="p-3 max-h-64 overflow-y-auto min-h-[220px]">
            {searchResults ? (
              // Search Mode Results
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                  Resultados da busca ({searchResults.length})
                </p>
                {searchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Nenhum ícone encontrado para "{searchQuery}".
                  </div>
                ) : (
                  <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5">
                    {searchResults.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectEmoji(item.emoji)}
                        title={item.name}
                        className={`group relative h-10 w-10 flex items-center justify-center rounded-xl text-xl transition-all hover:bg-teal-50 hover:scale-125 hover:z-10 ${
                          value === item.emoji ? 'bg-teal-100 ring-2 ring-teal-600' : 'bg-slate-50/50'
                        }`}
                      >
                        {item.emoji}
                        {value === item.emoji && (
                          <span className="absolute -top-1 -right-1 bg-teal-600 text-white rounded-full p-0.5 shadow-sm">
                            <Check size={8} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Tab Mode Grid
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                  <span>{activeCategory.name}</span>
                  <span className="text-[10px] text-slate-300 font-normal">{activeCategory.emojis.length} ícones</span>
                </p>
                <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5">
                  {activeCategory.emojis.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectEmoji(item.emoji)}
                      title={item.name}
                      className={`group relative h-10 w-10 flex items-center justify-center rounded-xl text-xl transition-all hover:bg-teal-50 hover:scale-125 hover:z-10 active:scale-95 ${
                        value === item.emoji ? 'bg-teal-100 ring-2 ring-teal-600 shadow-sm' : 'bg-slate-50/60 hover:bg-slate-100'
                      }`}
                    >
                      {item.emoji}
                      {value === item.emoji && (
                        <span className="absolute -top-1 -right-1 bg-teal-600 text-white rounded-full p-0.5 shadow-sm">
                          <Check size={8} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer bar */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Selecione para aplicar</span>
            {value && (
              <button
                type="button"
                onClick={handleClearIcon}
                className="font-bold text-slate-500 hover:text-rose-600 transition-colors"
              >
                Limpar seleção
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryIconPickerV2;

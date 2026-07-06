import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
      { emoji: '💰', name: 'Saco de Dinheiro', keywords: ['dinheiro', 'saldo', 'riqueza', 'grana', 'capital'] },
      { emoji: '💵', name: 'Nota de Dólar', keywords: ['nota', 'cifrão', 'pagamento', 'dolar'] },
      { emoji: '💶', name: 'Nota de Euro', keywords: ['euro', 'moeda', 'cambio'] },
      { emoji: '💷', name: 'Nota de Libra', keywords: ['libra', 'moeda'] },
      { emoji: '🪙', name: 'Moeda', keywords: ['moeda', 'trocado', 'investimento', 'metal'] },
      { emoji: '💳', name: 'Cartão de Crédito', keywords: ['cartao', 'credito', 'debito', 'banco', 'inter', 'pagamento'] },
      { emoji: '🏦', name: 'Banco', keywords: ['banco', 'instituicao', 'agencia', 'ted', 'doc'] },
      { emoji: '📈', name: 'Gráfico Subindo', keywords: ['lucro', 'investimento', 'rendimento', 'bolsa', 'ações', 'fundos'] },
      { emoji: '📉', name: 'Gráfico Descendo', keywords: ['prejuizo', 'queda', 'gasto', 'perda', 'inflação'] },
      { emoji: '📊', name: 'Gráfico de Barras', keywords: ['relatorio', 'estatistica', 'metas', 'analise', 'planilha'] },
      { emoji: '🧾', name: 'Recibo', keywords: ['recibo', 'nota fiscal', 'comprovante', 'fatura', 'imposto', 'xml'] },
      { emoji: '🔐', name: 'Cofre Trancado', keywords: ['cofre', 'reserva', 'poupanca', 'segurança'] },
      { emoji: '🛍️', name: 'Sacola de Compras', keywords: ['compras', 'loja', 'gastos', 'sacola'] },
      { emoji: '📱', name: 'Pix / Celular', keywords: ['pix', 'celular', 'transferencia', 'app'] },
      { emoji: '💎', name: 'Diamante', keywords: ['patrimonio', 'luxo', 'investimento', 'joia'] },
      { emoji: '🏧', name: 'Caixa Eletrônico', keywords: ['saque', 'caixa', 'banco', 'dinheiro'] },
      { emoji: '🏷️', name: 'Etiqueta', keywords: ['tag', 'promocao', 'desconto', 'cupom', 'preco'] },
      { emoji: '📜', name: 'Contrato', keywords: ['documento', 'termo', 'servico', 'papel', 'assinatura'] },
      { emoji: '💸', name: 'Dinheiro Voando', keywords: ['despesa', 'gasto', 'perdido', 'pagamento', 'rombo'] },
      { emoji: '💼', name: 'Maleta', keywords: ['negocios', 'trabalho', 'executivo'] },
      { emoji: '⚖️', name: 'Balança da Justiça', keywords: ['processo', 'juridico', 'advogado', 'justiça', 'acerto'] },
      { emoji: '🏬', name: 'Loja de Departamento', keywords: ['shopping', 'loja', 'comercio'] },
    ]
  },
  {
    id: 'food_drink',
    name: 'Comidas & Bebidas',
    icon: <Utensils size={18} />,
    emojis: [
      { emoji: '🍺', name: 'Cerveja / Copo', keywords: ['cerveja', 'chopp', 'bar', 'bebida', 'lazer', 'gelada'] },
      { emoji: '🍻', name: 'Canecas de Cerveja', keywords: ['chopp', 'cervejas', 'brinde', 'happy hour', 'amigos', 'bar'] },
      { emoji: '🍷', name: 'Vinho', keywords: ['vinho', 'tinto', 'jantar', 'bebida', 'taca'] },
      { emoji: '🍸', name: 'Coquetel / Martini', keywords: ['drink', 'coquetel', 'balada', 'festa', 'martini'] },
      { emoji: '🍹', name: 'Drink Tropical', keywords: ['caipirinha', 'suco', 'praia', 'lazer', 'gin'] },
      { emoji: '🥃', name: 'Copo de Whisky', keywords: ['whisky', 'rum', 'copo', 'dose', 'bebida', 'gelo'] },
      { emoji: '🍾', name: 'Champanhe / Espumante', keywords: ['espumante', 'celebracao', 'ano novo', 'estouro'] },
      { emoji: '☕', name: 'Café', keywords: ['cafe', 'expresso', 'padaria', 'cafezinho', 'manha', 'quente'] },
      { emoji: '🍵', name: 'Chá', keywords: ['cha', 'quente', 'calmante'] },
      { emoji: '🧃', name: 'Caixa de Suco', keywords: ['suco', 'bebida', 'lanche', 'infantil'] },
      { emoji: '🥤', name: 'Refrigerante / Copo', keywords: ['refri', 'refrigerante', 'fast food', 'cinema', 'suco'] },
      { emoji: '🍽️', name: 'Prato e Talheres', keywords: ['restaurante', 'almoco', 'jantar', 'comida', 'buffet'] },
      { emoji: '🍕', name: 'Pizza', keywords: ['pizza', 'delivery', 'lanche', 'ifood', 'sabado'] },
      { emoji: '🍔', name: 'Hambúrguer', keywords: ['hamburguer', 'fast food', 'lanche', 'artesanal'] },
      { emoji: '🍟', name: 'Batata Frita', keywords: ['batata', 'lanche', 'petisco', 'mcdonalds'] },
      { emoji: '🌭', name: 'Cachorro Quente', keywords: ['hot dog', 'lanche', 'podrao'] },
      { emoji: '🥩', name: 'Carne / Churrasco', keywords: ['churrasco', 'carne', 'acougue', 'churrasqueira', 'picanha'] },
      { emoji: '🍖', name: 'Costela / Osso', keywords: ['costela', 'carne', 'churrasco'] },
      { emoji: '🍗', name: 'Frango Frito', keywords: ['frango', 'galeto', 'kfc'] },
      { emoji: '🍣', name: 'Sushi / Japa', keywords: ['sushi', 'comida japonesa', 'peixe', 'temaki', 'rodizio'] },
      { emoji: '🥗', name: 'Salada / Saudável', keywords: ['saudavel', 'fit', 'marmita', 'dieta', 'vegetariano'] },
      { emoji: '🍞', name: 'Pão / Padaria', keywords: ['pao', 'padaria', 'cafe da manha', 'frances'] },
      { emoji: '🥐', name: 'Croissant', keywords: ['croissant', 'cafe', 'padaria'] },
      { emoji: '🧀', name: 'Queijo', keywords: ['queijo', 'laticinios', 'frios'] },
      { emoji: '🛒', name: 'Carrinho de Mercado', keywords: ['mercado', 'supermercado', 'compras', 'rancho', 'atacado'] },
      { emoji: '🍫', name: 'Chocolate', keywords: ['doce', 'chocolate', 'sobremesa', 'cacau'] },
      { emoji: '🍦', name: 'Sorvete de Casquinha', keywords: ['sorvete', 'acai', 'doce', 'calor'] },
      { emoji: '🍨', name: 'Sorvete de Taça', keywords: ['sorvete', 'sobremesa'] },
      { emoji: '🍰', name: 'Fatia de Bolo', keywords: ['bolo', 'aniversario', 'festa', 'doce'] },
      { emoji: '🍩', name: 'Rosquinha / Donuts', keywords: ['donuts', 'doce', 'lanche'] },
      { emoji: '🍪', name: 'Cookie', keywords: ['biscoito', 'cookie', 'doce'] },
      { emoji: '🍿', name: 'Pipoca', keywords: ['pipoca', 'cinema', 'filme'] },
      { emoji: '🍎', name: 'Maçã / Frutas', keywords: ['fruta', 'feira', 'saudavel'] },
      { emoji: '🍌', name: 'Banana', keywords: ['banana', 'feira', 'fruta'] },
      { emoji: '🍓', name: 'Morango', keywords: ['morango', 'fruta', 'doce'] },
    ]
  },
  {
    id: 'transport',
    name: 'Transporte & Viagens',
    icon: <Car size={18} />,
    emojis: [
      { emoji: '🚗', name: 'Carro', keywords: ['carro', 'automovel', 'veiculo', 'garagem'] },
      { emoji: '🚘', name: 'Carro Frente', keywords: ['uber', 'taxi', 'transporte', 'corrida'] },
      { emoji: '🚙', name: 'SUV / Utilitário', keywords: ['suv', 'jipe', 'carro'] },
      { emoji: '⛽', name: 'Bomba de Gasolina', keywords: ['combustivel', 'gasolina', 'alcool', 'posto', 'diesel', 'gnv'] },
      { emoji: '🛵', name: 'Moto / Delivery', keywords: ['moto', 'entrega', 'ifood', 'motoboy', 'scooter'] },
      { emoji: '🚲', name: 'Bicicleta', keywords: ['bike', 'bicicleta', 'esporte', 'ciclovia'] },
      { emoji: '🚌', name: 'Ônibus', keywords: ['onibus', 'transporte publico', 'passagem', 'circular', 'rodoviaria'] },
      { emoji: '🚇', name: 'Metrô', keywords: ['metro', 'trem', 'transporte', 'subway'] },
      { emoji: '✈️', name: 'Avião', keywords: ['aviao', 'voo', 'viagem', 'passagem', 'aeroporto', 'milhas'] },
      { emoji: '🧳', name: 'Mala de Viagem', keywords: ['mala', 'viagem', 'ferias', 'hotel', 'bagagem'] },
      { emoji: '🚕', name: 'Táxi', keywords: ['taxi', 'uber', 'corrida', 'transporte'] },
      { emoji: '🛠️', name: 'Oficina / Manutenção', keywords: ['oficina', 'mecanico', 'manutencao', 'revisao', 'conserto', 'pneu'] },
      { emoji: '🛑', name: 'Pare / Trânsito', keywords: ['pedagio', 'multa', 'transito', 'placa'] },
      { emoji: '🅿️', name: 'Estacionamento', keywords: ['estacionamento', 'vaga', 'valet', 'shopping'] },
      { emoji: '🚢', name: 'Navio / Cruzeiro', keywords: ['navio', 'cruzeiro', 'mar', 'porto', 'viagem'] },
      { emoji: '🛴', name: 'Patinete', keywords: ['patinete', 'eletrico', 'lazer'] },
      { emoji: '🚚', name: 'Caminhão / Mudança', keywords: ['caminhao', 'mudanca', 'frete', 'transporte'] },
      { emoji: '🚨', name: 'Sirene / Emergência', keywords: ['policia', 'ambulancia', 'multa', 'emergencia'] },
      { emoji: '🗺️', name: 'Mapa / GPS', keywords: ['mapa', 'gps', 'localizacao', 'destino', 'pedagio'] },
    ]
  },
  {
    id: 'home_lifestyle',
    name: 'Casa & Utilidades',
    icon: <ShoppingBag size={18} />,
    emojis: [
      { emoji: '🏠', name: 'Casa', keywords: ['casa', 'aluguel', 'moradia', 'condominio', 'lar'] },
      { emoji: '🏢', name: 'Apartamento / Prédio', keywords: ['apartamento', 'predio', 'condominio', 'escritorio'] },
      { emoji: '⚡', name: 'Energia / Luz', keywords: ['luz', 'energia', 'eletricidade', 'conta', 'enel', 'light'] },
      { emoji: '💧', name: 'Gota / Água', keywords: ['agua', 'saneamento', 'conta', 'sabesp', 'cedae'] },
      { emoji: '🔥', name: 'Gás / Fogo', keywords: ['gas', 'cozinha', 'aquecimento', 'botijao'] },
      { emoji: '🌐', name: 'Internet / Wi-Fi', keywords: ['internet', 'wifi', 'fibra', 'provedor', 'conexao'] },
      { emoji: '📺', name: 'TV / Streaming', keywords: ['tv', 'netflix', 'cable', 'streaming', 'hbo', 'disney', 'prime'] },
      { emoji: '🧹', name: 'Limpeza / Diarista', keywords: ['limpeza', 'diarista', 'faxina', 'produtos', 'vassoura'] },
      { emoji: '🛋️', name: 'Móveis / Sofá', keywords: ['sofa', 'moveis', 'decoracao', 'casa', 'poltrona'] },
      { emoji: '🔧', name: 'Reparos / Chaveiro', keywords: ['reparo', 'manutencao', 'reforma', 'ferramenta'] },
      { emoji: '🚬', name: 'Cigarro / Tabacaria', keywords: ['cigarro', 'fumo', 'tabacaria', 'vape', 'charuto', 'palheiro'] },
      { emoji: '👕', name: 'Roupas / Vestuário', keywords: ['roupa', 'vestuario', 'vestido', 'compras', 'camiseta', 'moda'] },
      { emoji: '👟', name: 'Tênis / Calçado', keywords: ['tenis', 'sapato', 'calcado', 'sneaker'] },
      { emoji: '💄', name: 'Cosméticos / Beleza', keywords: ['maquiagem', 'beleza', 'salao', 'estetica', 'perfume'] },
      { emoji: '✂️', name: 'Cabeleireiro / Barbeiro', keywords: ['corte', 'cabelo', 'barba', 'salao', 'barbearia'] },
      { emoji: '📦', name: 'Caixa / Mudança', keywords: ['caixa', 'correio', 'encomenda', 'mudanca', 'frete'] },
      { emoji: '🔑', name: 'Chave', keywords: ['chave', 'chaveiro', 'imovel', 'casa', 'portaria'] },
      { emoji: '🛏️', name: 'Cama / Quarto', keywords: ['cama', 'quarto', 'hotel', 'moveis'] },
      { emoji: '🛁', name: 'Banheiro / Banheira', keywords: ['banheiro', 'banheira', 'reforma'] },
      { emoji: '🧺', name: 'Cesto de Lavanderia', keywords: ['lavanderia', 'lavar', 'roupa', 'maquina'] },
      { emoji: '🧸', name: 'Brinquedo / Infantil', keywords: ['brinquedo', 'filho', 'crianca', 'bebe'] },
      { emoji: '🪴', name: 'Planta / Jardim', keywords: ['planta', 'jardim', 'vaso', 'flor', 'casa'] },
    ]
  },
  {
    id: 'health_pet',
    name: 'Saúde & Pets',
    icon: <HeartPulse size={18} />,
    emojis: [
      { emoji: '🏥', name: 'Hospital / Clínica', keywords: ['hospital', 'clinica', 'consulta', 'pronto socorro'] },
      { emoji: '💊', name: 'Remédio / Farmácia', keywords: ['remedio', 'farmacia', 'medicamento', 'drogaria', 'pilula'] },
      { emoji: '🩺', name: 'Estetoscópio / Médico', keywords: ['medico', 'plano de saude', 'consulta', 'exame'] },
      { emoji: '🦷', name: 'Dente / Dentista', keywords: ['dentista', 'odonto', 'dente', 'aparelho'] },
      { emoji: '👓', name: 'Óculos / Ótica', keywords: ['oculos', 'otica', 'lente', 'grau', 'sol'] },
      { emoji: '🏋️', name: 'Academia / Musculação', keywords: ['academia', 'gym', 'fitness', 'treino', 'peso', 'halter'] },
      { emoji: '🏃', name: 'Corrida / Cardio', keywords: ['corrida', 'esporte', 'cardio', 'caminhada'] },
      { emoji: '🧘', name: 'Yoga / Meditação', keywords: ['yoga', 'meditacao', 'mental', 'saude'] },
      { emoji: '🐕', name: 'Cachorro / Pet', keywords: ['cachorro', 'dog', 'pet', 'racao', 'veterinario'] },
      { emoji: '🐈', name: 'Gato', keywords: ['gato', 'cat', 'pet', 'veterinario', 'racao'] },
      { emoji: '🐾', name: 'Patas / Petshop', keywords: ['petshop', 'veterinario', 'banho e tosa', 'pet', 'patas'] },
      { emoji: '🦜', name: 'Pássaro', keywords: ['passaro', 'ave', 'pet'] },
      { emoji: '🐟', name: 'Peixe', keywords: ['peixe', 'aquario', 'pet'] },
      { emoji: '💉', name: 'Seringa / Vacina', keywords: ['vacina', 'injecao', 'exame', 'sangue'] },
      { emoji: '🩹', name: 'Curativo / Band-aid', keywords: ['bandaid', 'machucado', 'curativo'] },
      { emoji: '🧴', name: 'Creme / Protetor', keywords: ['protetor', 'creme', 'pele', 'higiene'] },
    ]
  },
  {
    id: 'leisure_events',
    name: 'Lazer & Eventos',
    icon: <Sparkles size={18} />,
    emojis: [
      { emoji: '🎉', name: 'Festa / Comemoração', keywords: ['festa', 'aniversario', 'evento', 'balada', 'comemoracao'] },
      { emoji: '🎬', name: 'Cinema / Filme', keywords: ['cinema', 'filme', 'pipoca', 'ingressos', 'netflix'] },
      { emoji: '🎮', name: 'Video Game', keywords: ['game', 'jogos', 'playstation', 'xbox', 'nintendo', 'pc'] },
      { emoji: '🎵', name: 'Música / Shows', keywords: ['musica', 'show', 'spotify', 'ingresso', 'concerto'] },
      { emoji: '⚽', name: 'Futebol / Esporte', keywords: ['futebol', 'jogo', 'esporte', 'ingresso', 'quadra'] },
      { emoji: '🏀', name: 'Basquete', keywords: ['basquete', 'esporte', 'jogo'] },
      { emoji: '🎾', name: 'Tênis', keywords: ['tenis', 'esporte', 'jogo', 'beach tennis'] },
      { emoji: '🎟️', name: 'Ingresso / Ticket', keywords: ['ingresso', 'evento', 'teatro', 'show', 'cinema'] },
      { emoji: '🎁', name: 'Presente', keywords: ['presente', 'aniversario', 'mimo', 'natal'] },
      { emoji: '📚', name: 'Livros / Leitura', keywords: ['livro', 'leitura', 'estudo', 'livraria'] },
      { emoji: '🏖️', name: 'Praia / Férias', keywords: ['praia', 'ferias', 'viagem', 'verao', 'mar', 'sol'] },
      { emoji: '📸', name: 'Fotografia / Câmera', keywords: ['foto', 'camera', 'ensaio', 'video'] },
      { emoji: '⛺', name: 'Acampamento', keywords: ['acampamento', 'trilha', 'natureza'] },
      { emoji: '🎳', name: 'Boliche', keywords: ['boliche', 'lazer', 'amigos'] },
      { emoji: '🃏', name: 'Cartas / Baralho', keywords: ['baralho', 'poker', 'jogos', 'tabuleiro'] },
      { emoji: '🎯', name: 'Dardo / Lazer', keywords: ['lazer', 'dardo', 'bar', 'alvo'] },
      { emoji: '🎡', name: 'Parque de Diversões', keywords: ['parque', 'roda gigante', 'ingressos'] },
      { emoji: '🎤', name: 'Karaokê / Microfone', keywords: ['musica', 'cantora', 'show', 'karaoke'] },
    ]
  },
  {
    id: 'work_education',
    name: 'Trabalho & Estudos',
    icon: <Briefcase size={18} />,
    emojis: [
      { emoji: '💼', name: 'Pasta / Trabalho', keywords: ['trabalho', 'emprego', 'salario', 'bossa', 'empresa', 'carreira'] },
      { emoji: '💻', name: 'Notebook / Computador', keywords: ['notebook', 'computador', 'tecnologia', 'freelance', 'home office'] },
      { emoji: '🎓', name: 'Graduação / Faculdade', keywords: ['faculdade', 'curso', 'pos', 'diploma', 'universidade'] },
      { emoji: '🖊️', name: 'Caneta / Papelaria', keywords: ['papelaria', 'material', 'escritorio', 'caneta'] },
      { emoji: '📋', name: 'Prancheta / Tasks', keywords: ['tarefas', 'planejamento', 'projeto', 'checklist'] },
      { emoji: '⏰', name: 'Relógio / Ponto', keywords: ['tempo', 'horas', 'ponto', 'atraso'] },
      { emoji: '📬', name: 'Correios / Encomenda', keywords: ['correios', 'frete', 'entrega', 'encomenda', 'pacote'] },
      { emoji: '🏫', name: 'Escola / Colégio', keywords: ['escola', 'colegio', 'estudo', 'filhos'] },
      { emoji: '🧠', name: 'Cérebro / Conhecimento', keywords: ['estudo', 'ideia', 'psicologia', 'terapia'] },
      { emoji: '📁', name: 'Pasta de Arquivo', keywords: ['arquivo', 'documentos', 'organizacao'] },
      { emoji: '🖥️', name: 'Monitor / Desktop', keywords: ['computador', 'ti', 'setup'] },
      { emoji: '🖨️', name: 'Impressora', keywords: ['copia', 'impressao', 'papelaria'] },
    ]
  },
  {
    id: 'expressions_symbols',
    name: 'Expressões & Símbolos',
    icon: <Smile size={18} />,
    emojis: [
      { emoji: '⭐', name: 'Estrela', keywords: ['estrela', 'favorito', 'destaque', 'brilho'] },
      { emoji: '❤️', name: 'Coração', keywords: ['coracao', 'amor', 'doacao', 'namoro'] },
      { emoji: '✅', name: 'Check Verde', keywords: ['ok', 'concluido', 'pago', 'certo'] },
      { emoji: '❌', name: 'X Vermelho', keywords: ['cancelado', 'erro', 'errado', 'rejeitado'] },
      { emoji: '🔄', name: 'Recorrência', keywords: ['recorrente', 'assinatura', 'mensal', 'renovacao'] },
      { emoji: '⚠️', name: 'Alerta / Aviso', keywords: ['alerta', 'urgente', 'importante', 'risco'] },
      { emoji: '📌', name: 'Tachinha / Fixo', keywords: ['fixo', 'importante', 'marcador', 'nota'] },
      { emoji: '🎯', name: 'Alvo / Meta', keywords: ['meta', 'objetivo', 'desafio', 'foco'] },
      { emoji: '💡', name: 'Ideia / Lâmpada', keywords: ['ideia', 'inovacao', 'projeto', 'luz'] },
      { emoji: '✨', name: 'Brilhos', keywords: ['novo', 'especial', 'destaque', 'magico'] },
      { emoji: '😃', name: 'Sorriso', keywords: ['feliz', 'pessoal', 'alegre'] },
      { emoji: '🔥', name: 'Fogo / Tendência', keywords: ['destaque', 'fogo', 'quente'] },
      { emoji: '🍀', name: 'Trevo / Sorte', keywords: ['sorte', 'loterias', 'trevo'] },
      { emoji: '✈️', name: 'Aviãozinho', keywords: ['envio', 'telegram', 'mensagem'] },
      { emoji: '🔒', name: 'Cadeado Fechado', keywords: ['seguro', 'senha', 'bloqueado'] },
      { emoji: '🔓', name: 'Cadeado Aberto', keywords: ['desbloqueado', 'liberado'] },
    ]
  }
];

export const CategoryIconPickerV2: React.FC<CategoryIconPickerV2Props> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('finance');
  const [searchQuery, setSearchQuery] = useState('');

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    <div className="inline-block text-left">
      {/* Trigger Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
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

      {/* WhatsApp-Style Modal via Portal (Escapes overflow-hidden) */}
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="absolute inset-0"
              onClick={() => setIsOpen(false)}
            />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] z-10 animate-in zoom-in-95 duration-150">
              
              {/* Modal Header */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-manrope">Escolher Ícone</h3>
                  <p className="text-[11px] text-slate-400">Selecione uma categoria ou busque pelo nome</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-slate-200/60 rounded-full text-slate-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Bar & Tabs */}
              <div className="p-3 bg-slate-50/50 border-b border-slate-100 space-y-2.5 shrink-0">
                <div className="relative flex items-center">
                  <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar ícone... (ex: cerveja, chopp, cigarro, uber)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
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
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth">
                    {EMOJI_CATEGORIES.map(cat => {
                      const isActive = activeTab === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveTab(cat.id)}
                          className={`flex items-center justify-center p-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
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

              {/* Emoji Grid Area (Flexible height with independent scroll) */}
              <div className="p-4 overflow-y-auto flex-1 min-h-[250px]">
                {searchResults ? (
                  // Search Mode Results
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">
                      Resultados da busca ({searchResults.length})
                    </p>
                    {searchResults.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400 italic">
                        Nenhum ícone encontrado para "{searchQuery}".
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 sm:grid-cols-7 gap-2">
                        {searchResults.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectEmoji(item.emoji)}
                            title={item.name}
                            className={`group relative h-11 w-11 flex items-center justify-center rounded-2xl text-2xl transition-all hover:bg-teal-50 hover:scale-125 hover:z-10 ${
                              value === item.emoji ? 'bg-teal-100 ring-2 ring-teal-600' : 'bg-slate-50/60 hover:bg-slate-100'
                            }`}
                          >
                            {item.emoji}
                            {value === item.emoji && (
                              <span className="absolute -top-1 -right-1 bg-teal-600 text-white rounded-full p-0.5 shadow-sm">
                                <Check size={10} />
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
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center justify-between">
                      <span>{activeCategory.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{activeCategory.emojis.length} ícones</span>
                    </p>
                    <div className="grid grid-cols-6 sm:grid-cols-7 gap-2">
                      {activeCategory.emojis.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectEmoji(item.emoji)}
                          title={item.name}
                          className={`group relative h-11 w-11 flex items-center justify-center rounded-2xl text-2xl transition-all hover:bg-teal-50 hover:scale-125 hover:z-10 active:scale-95 ${
                            value === item.emoji ? 'bg-teal-100 ring-2 ring-teal-600 shadow-sm' : 'bg-slate-50/60 hover:bg-slate-100'
                          }`}
                        >
                          {item.emoji}
                          {value === item.emoji && (
                            <span className="absolute -top-1 -right-1 bg-teal-600 text-white rounded-full p-0.5 shadow-sm">
                              <Check size={10} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer bar */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
                <span>Clique para selecionar</span>
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
          </div>,
          document.body
        )}
    </div>
  );
};

export default CategoryIconPickerV2;

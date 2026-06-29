import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Loader2, Check, X, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { criarTransacao } from '../../lib/financeiro/criarTransacao';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { editarTransacao } from '../../lib/financeiro/editarTransacao';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from './FinancialTransactionModalV2';
import { format, subDays, addDays, parseISO } from 'date-fns';

interface ExtractedData {
  acao: 'create' | 'delete';
  descricao: string;
  valor: number;
  tipo: 'income' | 'expense' | 'transfer';
  data: string;
  banco_carteira?: string;
  categoria?: string;
}

export function VoiceFloatingButton() {
  const { user } = useAuth();
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing' | 'confirming'>('idle');
  const [timer, setTimer] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  
  // Edição local das variáveis de criação
  const [localDescription, setLocalDescription] = useState('');
  const [localAmount, setLocalAmount] = useState(0);
  const [localDate, setLocalDate] = useState('');
  
  // Novos estados locais de recorrência/parcelas do Art
  const [localModalidade, setLocalModalidade] = useState<'unica' | 'parcelada' | 'recorrente'>('unica');
  const [localInstallmentTotal, setLocalInstallmentTotal] = useState(1);
  const [localPeriodicidade, setLocalPeriodicidade] = useState<'diaria' | 'semanal' | 'mensal' | 'anual'>('mensal');
  const [localRecurrenceInterval, setLocalRecurrenceInterval] = useState(1);
  
  // Seleções inteligentes
  const [matchedAccountId, setMatchedAccountId] = useState('');
  const [matchedCategoryId, setMatchedCategoryId] = useState('');
  
  // Exclusão
  const [matchedTransactionToDelete, setMatchedTransactionToDelete] = useState<any | null>(null);
  const [matchedTransactionToConfirm, setMatchedTransactionToConfirm] = useState<any | null>(null);

  // Listas locais de entidades
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Carregar contas e categorias para a correspondência inteligente
  useEffect(() => {
    if (!user) return;

    const loadEntities = async () => {
      try {
        // Buscar contas
        const { data: accountsData } = await supabase
          .from('financial_accounts')
          .select('id, name, type')
          .eq('user_id', user.id)
          .eq('is_active', true);
        
        if (accountsData) setAccounts(accountsData);

        // Buscar categorias
        const { data: categoriesData } = await supabase
          .from('financial_categories')
          .select('id, name')
          .eq('user_id', user.id);
        
        if (categoriesData) setCategories(categoriesData);
      } catch (err) {
        console.error('Erro ao carregar entidades para correspondência de voz:', err);
      }
    };

    loadEntities();
  }, [user]);

  // Limpar timers ao desmontar
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    audioChunksRef.current = [];
    setTimer(0);
    if (recordingState !== 'confirming') {
      setExtractedData(null);
      setMatchedTransactionToDelete(null);
      setMatchedTransactionToConfirm(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
      };

      mediaRecorder.start(250); // Envia chunks a cada 250ms
      setRecordingState('recording');

      // Iniciar timer
      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev >= 29) { // Limite de 30 segundos
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: any) {
      console.error('Erro ao acessar microfone:', err);
      toast.error('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.');
      setRecordingState('idle');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
  };

  // Converte Blob de áudio para Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async (audioBlob: Blob) => {
    const wasConfirming = recordingState === 'confirming' || extractedData !== null;
    const previousExtractedData = extractedData;

    setRecordingState('processing');

    try {
      const base64 = await blobToBase64(audioBlob);
      
      const response = await fetch('/api/lancamento-voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: 'audio/webm'
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Erro ao processar áudio com Gemini.');
      }

      const data: ExtractedData & {
        modalidade?: 'unica' | 'parcelada' | 'recorrente';
        parcelas_total?: number;
        periodicidade?: 'daily' | 'weekly' | 'monthly' | 'yearly';
        recorrencia_intervalo?: number;
      } = result.data;

      // Se for comando de confirmação por voz na tela de confirmação
      if (wasConfirming && (data.acao as any) === 'confirm') {
        if (previousExtractedData) {
          if (previousExtractedData.acao === 'delete') {
            setExtractedData(previousExtractedData);
            await handleConfirmDelete();
          } else if (previousExtractedData.acao === 'confirm') {
            setExtractedData(previousExtractedData);
            await handleConfirmPayment();
          } else {
            setExtractedData(previousExtractedData);
            await handleConfirm();
          }
        }
        return;
      }

      // Se for comando de cancelamento por voz
      if (wasConfirming && (data.acao as any) === 'cancel') {
        handleCancel();
        return;
      }

      // Caso contrário, é um novo lançamento, busca de exclusão, busca de confirmação ou ajuste
      setExtractedData(data);
      
      // Inicializar variáveis locais para edição
      setLocalDescription(data.descricao || '');
      setLocalAmount(data.valor || 0);
      setLocalDate(data.data || '');

      // Se veio modalidade no áudio, atualizar os estados locais
      if (data.modalidade) {
        setLocalModalidade(data.modalidade);
      }
      if (data.parcelas_total) {
        setLocalInstallmentTotal(data.parcelas_total);
      }
      if (data.periodicidade) {
        const mappedPeriodicidade = 
          data.periodicidade === 'daily' ? 'diaria' : 
          data.periodicidade === 'weekly' ? 'semanal' : 
          data.periodicidade === 'yearly' ? 'anual' : 'mensal';
        setLocalPeriodicidade(mappedPeriodicidade);
      }
      if (data.recorrencia_intervalo) {
        setLocalRecurrenceInterval(data.recorrencia_intervalo);
      }

      if (data.acao === 'delete') {
        // Fluxo de busca de transação para deletar
        await findAndSetTransactionToDelete(data);
      } else if ((data.acao as any) === 'confirm') {
        // Fluxo de busca de transação existente para confirmar/dar baixa
        await findAndSetTransactionToConfirm(data);
      } else {
        // Fluxo de correspondência inteligente de criação
        runMatching(data);
      }
      
      setRecordingState('confirming');

    } catch (err: any) {
      console.error('Erro no processamento da IA:', err);
      toast.error(err.message || 'Erro ao enviar ou interpretar o áudio.');
      if (wasConfirming) {
        setExtractedData(previousExtractedData);
        setRecordingState('confirming');
      } else {
        setRecordingState('idle');
      }
    }
  };

  // Busca uma transação existente no banco que dê match com os parâmetros para exclusão
  const findAndSetTransactionToDelete = async (data: ExtractedData) => {
    if (!user) return;

    try {
      const targetDate = parseISO(data.data);
      // Busca lançamentos no intervalo de +- 2 dias para tolerar fusos horários/limites de horário
      const startDateStr = format(subDays(targetDate, 2), 'yyyy-MM-dd');
      const endDateStr = format(addDays(targetDate, 2), 'yyyy-MM-dd');

      const { data: txList, error } = await supabase
        .from('financial_transactions')
        .select('id, description, amount, date, type, account_id, financial_accounts!account_id(name)')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (error) throw error;

      // Fuzzy matching na lista
      const match = (txList || []).find(tx => {
        const valMatch = Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descMatch = descClean.includes(searchClean) || searchClean.includes(descClean);
        return valMatch && descMatch;
      });

      if (match) {
        setMatchedTransactionToDelete({
          id: match.id,
          description: match.description,
          amount: match.amount,
          date: match.date,
          type: match.type,
          accountName: (match as any).financial_accounts?.name || 'Conta não especificada'
        });
      } else {
        setMatchedTransactionToDelete(null);
      }

    } catch (err) {
      console.error('Erro ao buscar transação para exclusão:', err);
      setMatchedTransactionToDelete(null);
    }
  };

  // Busca uma transação pendente existente no banco que dê match com os parâmetros para confirmação
  const findAndSetTransactionToConfirm = async (data: ExtractedData) => {
    if (!user) return;

    try {
      const targetDate = parseISO(data.data);
      // Busca lançamentos no intervalo de +- 2 dias para tolerar fusos horários/limites de horário
      const startDateStr = format(subDays(targetDate, 2), 'yyyy-MM-dd');
      const endDateStr = format(addDays(targetDate, 2), 'yyyy-MM-dd');

      const { data: txList, error } = await supabase
        .from('financial_transactions')
        .select('id, description, amount, date, type, account_id, status, financial_accounts!account_id(name)')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (error) throw error;

      // Fuzzy matching na lista, priorizando pendentes
      const isGenericDescription = (desc: string) => {
        const d = desc.toLowerCase().trim();
        return !d || 
               d === 'lançamento' || d === 'lancamento' || 
               d === 'despesa' || d === 'receita' || 
               d === 'transferência' || d === 'transferencia' || 
               d === 'pagamento' || d === 'compra' || 
               d === 'transação' || d === 'transacao' || 
               d === 'conta';
      };

      const pendingMatch = (txList || []).find(tx => {
        const valMatch = Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const isGeneric = isGenericDescription(data.descricao);
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descMatch = isGeneric || descClean.includes(searchClean) || searchClean.includes(descClean);
        return valMatch && descMatch && tx.status === 'pending';
      });

      const match = pendingMatch || (txList || []).find(tx => {
        const valMatch = Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const isGeneric = isGenericDescription(data.descricao);
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descMatch = isGeneric || descClean.includes(searchClean) || searchClean.includes(descClean);
        return valMatch && descMatch;
      });

      if (match) {
        setMatchedTransactionToConfirm({
          id: match.id,
          description: match.description,
          amount: match.amount,
          date: match.date,
          type: match.type,
          accountName: (match as any).financial_accounts?.name || 'Conta não especificada'
        });
      } else {
        setMatchedTransactionToConfirm(null);
      }

    } catch (err) {
      console.error('Erro ao buscar transação para confirmação:', err);
      setMatchedTransactionToConfirm(null);
    }
  };

  // Realiza a correspondência de contas e categorias para criação
  const runMatching = (data: ExtractedData) => {
    // 1. Mapeamento de conta
    const suggestedBank = data.banco_carteira || '';
    const matchedAccId = matchAccount(suggestedBank, accounts);
    setMatchedAccountId(matchedAccId);

    // 2. Mapeamento de categoria
    const suggestedCat = data.categoria || '';
    const matchedCatId = matchCategory(suggestedCat, categories);
    setMatchedCategoryId(matchedCatId);
  };

  const matchAccount = (suggestedBank: string, accountsList: any[]): string => {
    if (accountsList.length === 0) return '';

    const creditCards = accountsList.filter(a => a.type === 'credit_card');
    const checkings = accountsList.filter(a => a.type === 'checking' || a.type === 'savings' || a.type === 'investment');

    const textLower = suggestedBank.toLowerCase();
    const isMentioningCard = textLower.includes('cartao') || textLower.includes('cartão') || textLower.includes('credito') || textLower.includes('crédito');
    const isMentioningCashOrChecking = textLower.includes('pix') || textLower.includes('debito') || textLower.includes('débito') || textLower.includes('dinheiro') || textLower.includes('carteira') || textLower.includes('conta') || textLower.includes('poupança') || textLower.includes('poupanca') || textLower.includes('transferência') || textLower.includes('transferencia');

    // Regra: "Se eu falo em PIX, só pode ser uma conta corrente. Se eu só tiver uma, deve assumir essa única."
    if (isMentioningCashOrChecking && checkings.length === 1) {
      return checkings[0].id;
    }

    // Regra para cartão
    if (isMentioningCard && creditCards.length === 1) {
      return creditCards[0].id;
    }

    // Fuzzy matching por nome aproximado
    if (suggestedBank) {
      const bankClean = suggestedBank.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const matched = accountsList.find(acc => {
        const accNameClean = acc.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return accNameClean.includes(bankClean) || bankClean.includes(accNameClean);
      });
      if (matched) return matched.id;
    }

    // Fallback final: se houver apenas uma conta no total
    if (accountsList.length === 1) {
      return accountsList[0].id;
    }

    return '';
  };

  const matchCategory = (suggestedCategory: string, categoriesList: any[]): string => {
    if (categoriesList.length === 0) return '';
    if (!suggestedCategory) return categoriesList[0]?.id || '';

    const catClean = suggestedCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matched = categoriesList.find(c => {
      const nameClean = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nameClean.includes(catClean) || catClean.includes(nameClean);
    });

    if (matched) return matched.id;
    return categoriesList[0]?.id || '';
  };

  const handleConfirm = async () => {
    if (!extractedData) return;

    try {
      setRecordingState('processing');

      const transacaoInput = {
        description: localDescription || extractedData.descricao,
        amount: localAmount || extractedData.valor,
        type: extractedData.tipo,
        date: localDate || extractedData.data,
        category_id: matchedCategoryId || undefined,
        account_id: matchedAccountId || undefined,
        modalidade: localModalidade,
        status: 'paid' as const, // Marcar como pago por padrão no lançamento rápido
        installment_total: localModalidade === 'parcelada' ? localInstallmentTotal : undefined,
        recurrence_period: localModalidade === 'recorrente' ? (localPeriodicidade === 'diaria' ? 'daily' : localPeriodicidade === 'semanal' ? 'weekly' : localPeriodicidade === 'anual' ? 'yearly' : 'monthly') : undefined,
        recurrence_interval: localModalidade === 'recorrente' ? localRecurrenceInterval : undefined
      };

      const { error } = await criarTransacao(transacaoInput);

      if (error) throw error;

      toast.success('Lançamento criado com sucesso! 🚀');
      
      // Notificar telas abertas para atualizar
      window.dispatchEvent(new CustomEvent('transaction_created'));
      
      setRecordingState('idle');
      setExtractedData(null);

    } catch (err: any) {
      console.error('Erro ao criar transação via IA:', err);
      toast.error('Erro ao persistir o lançamento no banco de dados.');
      setRecordingState('confirming');
    }
  };

  const handleConfirmDelete = async () => {
    if (!matchedTransactionToDelete) return;

    try {
      setRecordingState('processing');

      const { error } = await deletarTransacao(matchedTransactionToDelete.id);

      if (error) throw error;

      toast.success('Lançamento excluído com sucesso! 🗑️');
      
      // Notificar telas abertas para atualizar
      window.dispatchEvent(new CustomEvent('transaction_created'));
      
      setRecordingState('idle');
      setExtractedData(null);
      setMatchedTransactionToDelete(null);

    } catch (err: any) {
      console.error('Erro ao excluir transação via voz:', err);
      toast.error('Erro ao excluir o lançamento do banco.');
      setRecordingState('confirming');
    }
  };

  const handleConfirmPayment = async () => {
    if (!matchedTransactionToConfirm) return;

    try {
      setRecordingState('processing');

      const { error } = await editarTransacao(matchedTransactionToConfirm.id, {
        status: 'paid'
      }, 'this');

      if (error) throw error;

      toast.success('Lançamento confirmado com sucesso! 💰');
      
      // Notificar telas abertas para atualizar
      window.dispatchEvent(new CustomEvent('transaction_created'));
      
      setRecordingState('idle');
      setExtractedData(null);
      setMatchedTransactionToConfirm(null);

    } catch (err: any) {
      console.error('Erro ao confirmar transação via voz:', err);
      toast.error('Erro ao confirmar o lançamento no banco.');
      setRecordingState('confirming');
    }
  };

  const handleCancel = () => {
    setRecordingState('idle');
    setExtractedData(null);
    setMatchedTransactionToDelete(null);
    setMatchedTransactionToConfirm(null);
  };

  const handleAdjust = () => {
    setRecordingState('idle');
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    setRecordingState('idle');
    setExtractedData(null);
    setMatchedTransactionToDelete(null);
    window.dispatchEvent(new CustomEvent('transaction_created'));
  };

  const formatExtractedDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    if (type === 'income') return 'receita';
    if (type === 'expense') return 'despesa';
    return 'transferência';
  };

  return (
    <>
      {/* Contêiner com z-index altíssimo para ficar por cima de tudo na tela */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
        {/* Janela de Interface de Voz (Mini Modal) */}
        {recordingState !== 'idle' && (
          <div className="mb-4 w-85 max-w-[90vw] bg-white/95 border border-slate-200 backdrop-blur-md shadow-2xl rounded-2xl p-5 animate-in slide-in-from-bottom-5 duration-200 flex flex-col gap-4 font-['Inter',sans-serif]">
            
            {/* Cabeçalho */}
            <div className="flex items-start justify-between">
              <span className="text-[9px] bg-slate-900 text-teal-400 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                Assistente Art
              </span>
              <button 
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100 border-0 bg-transparent cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* ESTADO 1: Gravando (Instrutivo com Dicas) */}
            {recordingState === 'recording' && (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-bold">Gravando áudio...</p>
                  <span className="text-xs text-rose-500 font-black tracking-wide animate-pulse">{timer}s / 30s</span>
                </div>
                
                {/* Ondas Sonoras de Gravação Visual Premium */}
                <div className="flex items-center justify-center gap-1.5 py-4 bg-slate-50 rounded-2xl border border-slate-100/50 shadow-inner">
                  <div className="w-1.5 h-8 bg-[#14b8a6] rounded-full animate-bounce duration-300" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1.5 h-12 bg-[#29a8a8] rounded-full animate-bounce duration-200" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-16 bg-[#14b8a6] rounded-full animate-bounce duration-300" style={{ animationDelay: '0.3s' }} />
                  <div className="w-1.5 h-10 bg-[#29a8a8] rounded-full animate-bounce duration-100" style={{ animationDelay: '0.4s' }} />
                  <div className="w-1.5 h-6 bg-slate-400 rounded-full animate-bounce duration-300" style={{ animationDelay: '0.5s' }} />
                </div>

                <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100/30 text-[11px] text-teal-800 leading-relaxed font-semibold">
                  <p className="mb-1 text-[10px] font-black uppercase text-[#29a8a8] tracking-wider">Como falar:</p>
                  <ul className="list-disc pl-3.5 space-y-1">
                    <li>"Recebi 150 reais de João ontem no pix"</li>
                    <li>"Paguei 10 reais de cerveja no cartão"</li>
                    <li>"Exclua a despesa de 25 reais de almoço hoje"</li>
                  </ul>
                </div>
                
                {/* Botões Lado a Lado: Cancelar (Vermelho) e Enviar (Verde) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleCancel}
                    className="py-3 bg-rose-600 hover:bg-rose-500 border-0 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                  <button
                    onClick={stopRecording}
                    className="py-3 bg-emerald-600 hover:bg-emerald-500 border-0 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Square size={14} className="fill-white shrink-0" />
                    Enviar
                  </button>
                </div>
              </div>
            )}

            {/* ESTADO 2: Processando */}
            {recordingState === 'processing' && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 size={36} className="animate-spin text-[#14b8a6]" />
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-800">Art está ouvindo...</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Fale o que deseja lançar</p>
                </div>
              </div>
            )}

            {/* ESTADO 3: Confirmando */}
            {recordingState === 'confirming' && extractedData && (
              <div className="flex flex-col gap-4">
                
                {/* AÇÃO: CREATE (Criação de transação) */}
                {extractedData.acao === 'create' && (
                  <div className="flex flex-col gap-3.5">
                    <p className="text-[11px] font-bold text-slate-500 leading-tight">
                      Deseja criar esta nova <strong className="text-slate-800 font-black">{extractedData.tipo === 'income' ? 'receita' : extractedData.tipo === 'expense' ? 'despesa' : 'transferência'}</strong>?
                    </p>

                    {/* Inputs Rápidos Editáveis e Dropdowns */}
                    <div className="grid grid-cols-1 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      
                      {/* Seletor do Tipo de Transação */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Tipo</label>
                        <div className="grid grid-cols-3 gap-1 bg-white border border-slate-200 p-0.5 rounded-lg">
                          {(['income', 'expense', 'transfer'] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setExtractedData(prev => prev ? { ...prev, tipo: t } : null);
                              }}
                              className={`py-1 text-[10px] font-bold rounded-md border-0 transition-all cursor-pointer ${
                                extractedData.tipo === t 
                                  ? t === 'income' ? 'bg-teal-600 text-white shadow-sm' : t === 'expense' ? 'bg-rose-600 text-white shadow-sm' : 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-transparent text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {t === 'income' ? 'Receita' : t === 'expense' ? 'Despesa' : 'Transf.'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Descrição</label>
                        <input
                          type="text"
                          value={localDescription}
                          onChange={(e) => setLocalDescription(e.target.value)}
                          className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Valor (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={localAmount}
                            onChange={(e) => setLocalAmount(parseFloat(e.target.value) || 0)}
                            className="w-full text-xs font-bold text-[#14b8a6] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                            {localModalidade !== 'unica' ? 'Data Início' : 'Data'}
                          </label>
                          <input
                            type="date"
                            value={localDate}
                            onChange={(e) => setLocalDate(e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none"
                          />
                        </div>
                      </div>

                      {/* Seletor de Modalidade */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Modalidade</label>
                        <select
                          value={localModalidade}
                          onChange={(e) => setLocalModalidade(e.target.value as any)}
                          className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-[#14b8a6] outline-none"
                        >
                          <option value="unica">📅 Única</option>
                          <option value="parcelada">💳 Parcelada</option>
                          <option value="recorrente">🔄 Recorrente</option>
                        </select>
                      </div>

                      {/* Se for Parcelada */}
                      {localModalidade === 'parcelada' && (
                        <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/30 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Total Parcelas</label>
                            <input
                              type="number"
                              min="2"
                              value={localInstallmentTotal}
                              onChange={(e) => setLocalInstallmentTotal(Math.max(2, parseInt(e.target.value) || 2))}
                              className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:border-[#14b8a6] outline-none"
                            />
                          </div>
                          <div className="flex flex-col justify-end text-[10px] text-slate-500 font-bold leading-tight pb-1.5">
                            <span>Gerará: 1 de {localInstallmentTotal}</span>
                          </div>
                        </div>
                      )}

                      {/* Se for Recorrente */}
                      {localModalidade === 'recorrente' && (
                        <div className="grid grid-cols-2 gap-2 bg-teal-50/30 p-2.5 rounded-xl border border-teal-100/20 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Frequência</label>
                            <select
                              value={localPeriodicidade}
                              onChange={(e) => setLocalPeriodicidade(e.target.value as any)}
                              className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:border-[#14b8a6] outline-none"
                            >
                              <option value="diaria">Diária</option>
                              <option value="semanal">Semanal</option>
                              <option value="mensal">Mensal</option>
                              <option value="anual">Anual</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Repetir a cada</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                value={localRecurrenceInterval}
                                onChange={(e) => setLocalRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:border-[#14b8a6] outline-none"
                              />
                              <span className="text-[10px] text-slate-500 font-bold shrink-0">
                                {localPeriodicidade === 'diaria' ? (localRecurrenceInterval === 1 ? 'dia' : 'dias') :
                                 localPeriodicidade === 'semanal' ? (localRecurrenceInterval === 1 ? 'sem.' : 'semanas') :
                                 localPeriodicidade === 'anual' ? (localRecurrenceInterval === 1 ? 'ano' : 'anos') :
                                 (localRecurrenceInterval === 1 ? 'mês' :
                                  localRecurrenceInterval === 2 ? 'bimestre' :
                                  localRecurrenceInterval === 3 ? 'trimestre' : 'meses')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dropdown de Conta */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Conta / Carteira</label>
                        <select
                          value={matchedAccountId}
                          onChange={(e) => setMatchedAccountId(e.target.value)}
                          className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-[#14b8a6] outline-none"
                        >
                          <option value="">Selecione uma conta...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type === 'credit_card' ? 'Cartão' : 'Conta/PIX'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Dropdown de Categoria */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Categoria</label>
                        <select
                          value={matchedCategoryId}
                          onChange={(e) => setMatchedCategoryId(e.target.value)}
                          className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-[#14b8a6] outline-none"
                        >
                          <option value="">Selecione uma categoria...</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <button
                        onClick={handleCancel}
                        className="py-2.5 px-3 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer text-center bg-white"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAdjust}
                        className="py-2.5 px-3 bg-slate-100 rounded-xl text-[11px] font-bold text-slate-700 hover:bg-slate-200 border-0 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Pencil size={12} />
                        Detalhes
                      </button>
                      <button
                        onClick={handleConfirm}
                        className="py-2.5 px-3 bg-teal-600 hover:bg-teal-500 border-0 text-white rounded-xl text-[11px] font-bold shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check size={12} />
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}

                {/* AÇÃO: DELETE (Exclusão de transação) */}
                {extractedData.acao === 'delete' && (
                  <div className="flex flex-col gap-3">
                    {matchedTransactionToDelete ? (
                      <>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                          Deseja excluir a <strong className="text-rose-600 font-black">{getTransactionTypeLabel(matchedTransactionToDelete.type)}</strong> de{' '}
                          <strong className="text-rose-600 font-black">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(matchedTransactionToDelete.amount)}
                          </strong>
                          , referente a <strong className="text-slate-900 font-bold">"{matchedTransactionToDelete.description}"</strong> do dia{' '}
                          <strong className="text-slate-900 font-bold">{formatExtractedDate(matchedTransactionToDelete.date)}</strong> na conta <strong className="text-slate-900 font-bold">{matchedTransactionToDelete.accountName}</strong>?
                        </p>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            onClick={handleCancel}
                            className="py-2.5 px-4 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer text-center bg-white"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleConfirmDelete}
                            className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 border-0 text-white rounded-xl text-[11px] font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <X size={12} />
                            Excluir Registro
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold text-center py-2">
                          Nenhum lançamento de despesa ou receita <strong className="text-slate-900">"{extractedData.descricao}"</strong> no valor de{' '}
                          <strong className="text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extractedData.valor)}
                          </strong>{' '}
                          por volta de {formatExtractedDate(extractedData.data)} foi encontrado para exclusão.
                        </p>

                        <button
                          onClick={handleCancel}
                          className="w-full py-2.5 bg-slate-100 rounded-xl text-[11px] font-bold text-slate-700 hover:bg-slate-200 border-0 transition-colors cursor-pointer text-center"
                        >
                          Fechar
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* AÇÃO: CONFIRM (Confirmação de transação existente no banco) */}
                {extractedData.acao === 'confirm' && (
                  <div className="flex flex-col gap-3">
                    {matchedTransactionToConfirm ? (
                      <>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                          Deseja confirmar o pagamento da <strong className="text-teal-600 font-black">{getTransactionTypeLabel(matchedTransactionToConfirm.type)}</strong> de{' '}
                          <strong className="text-teal-600 font-black">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(matchedTransactionToConfirm.amount)}
                          </strong>
                          , referente a <strong className="text-slate-900 font-bold">"{matchedTransactionToConfirm.description}"</strong> do dia{' '}
                          <strong className="text-slate-900 font-bold">{formatExtractedDate(matchedTransactionToConfirm.date)}</strong> na conta <strong className="text-slate-900 font-bold">{matchedTransactionToConfirm.accountName}</strong>?
                        </p>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            onClick={handleCancel}
                            className="py-2.5 px-4 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer text-center bg-white"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleConfirmPayment}
                            className="py-2.5 px-4 bg-teal-600 hover:bg-teal-500 border-0 text-white rounded-xl text-[11px] font-bold shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check size={12} />
                            Confirmar Pagamento
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold text-center py-2">
                          Nenhum lançamento pendente <strong className="text-slate-900">"{extractedData.descricao || 'não especificado'}"</strong> no valor de{' '}
                          <strong className="text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extractedData.valor)}
                          </strong>{' '}
                          por volta de {formatExtractedDate(extractedData.data)} foi encontrado para confirmação.
                        </p>

                        <button
                          onClick={handleCancel}
                          className="w-full py-2.5 bg-slate-100 rounded-xl text-[11px] font-bold text-slate-700 hover:bg-slate-200 border-0 transition-colors cursor-pointer text-center"
                        >
                          Fechar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Botão de Controle Flutuante Principal */}
        {(recordingState === 'idle' || recordingState === 'confirming') && (
          <button
            onClick={startRecording}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all hover:scale-105 shadow-teal-600/20 ring-4 ring-teal-600/0 hover:ring-teal-600/10 bg-teal-600 hover:bg-teal-500 select-none outline-none cursor-pointer border-0 z-50 animate-bounce duration-1000"
            style={{ animationDuration: '3s' }}
            title="Fale com Art — seu assistente financeiro por voz"
          >
            <Mic size={24} />
          </button>
        )}
      </div>

      {/* Modal padrão completo se o usuário optar por Ajustar */}
      {isModalOpen && extractedData && (
        <FinancialTransactionModalV2
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setExtractedData(null);
            setMatchedTransactionToDelete(null);
            setMatchedTransactionToConfirm(null);
          }}
          onSuccess={handleModalSuccess}
          initialType={extractedData.tipo}
          initialDescription={localDescription}
          initialAmount={localAmount}
          initialDate={localDate}
          initialAccountId={matchedAccountId}
          initialModalidade={localModalidade}
          initialInstallmentTotal={localInstallmentTotal}
          initialPeriodicidade={localPeriodicidade}
          initialRecurrenceInterval={localRecurrenceInterval}
        />
      )}
    </>
  );
}

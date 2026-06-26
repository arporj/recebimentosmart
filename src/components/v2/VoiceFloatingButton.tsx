import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Loader2, Check, X, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { criarTransacao } from '../../lib/financeiro/criarTransacao';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from './FinancialTransactionModalV2';
import { format } from 'date-fns';

interface ExtractedData {
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
  const [transcriptText, setTranscriptText] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [matchedAccountId, setMatchedAccountId] = useState('');
  const [matchedCategoryId, setMatchedCategoryId] = useState('');
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
    setTranscriptText('');
    setExtractedData(null);

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

      const data: ExtractedData = result.data;
      setExtractedData(data);
      runMatching(data);
      setRecordingState('confirming');

    } catch (err: any) {
      console.error('Erro no processamento da IA:', err);
      toast.error(err.message || 'Erro ao enviar ou interpretar o áudio.');
      setRecordingState('idle');
    }
  };

  // Realiza a correspondência de contas e categorias
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

    // Regra do Usuário: se disser "cartão" e houver só um cartão cadastrado
    const textLower = suggestedBank.toLowerCase();
    const isMentioningCard = textLower.includes('cartao') || textLower.includes('cartão') || textLower.includes('credito') || textLower.includes('crédito');
    const isMentioningCashOrChecking = textLower.includes('pix') || textLower.includes('debito') || textLower.includes('débito') || textLower.includes('dinheiro') || textLower.includes('carteira') || textLower.includes('conta') || textLower.includes('poupança') || textLower.includes('poupanca');

    if (isMentioningCard && creditCards.length === 1) {
      return creditCards[0].id;
    }

    if (isMentioningCashOrChecking && checkings.length === 1) {
      return checkings[0].id;
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

    // Fallback final: se houver apenas uma conta no sistema
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
        description: extractedData.descricao,
        amount: extractedData.valor,
        type: extractedData.tipo,
        date: extractedData.data,
        category_id: matchedCategoryId || undefined,
        account_id: matchedAccountId || undefined,
        modalidade: 'unica' as const,
        status: 'paid' as const // Marcar como pago/recebido por padrão no lançamento rápido por voz
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

  const handleCancel = () => {
    setRecordingState('idle');
    setExtractedData(null);
  };

  const handleAdjust = () => {
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    setRecordingState('idle');
    setExtractedData(null);
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

  const getAccountName = () => {
    const acc = accounts.find(a => a.id === matchedAccountId);
    return acc ? acc.name : 'Conta não especificada';
  };

  const getCategoryName = () => {
    const cat = categories.find(c => c.id === matchedCategoryId);
    return cat ? cat.name : 'Categoria não especificada';
  };

  const getTransactionTypeLabel = (type: string) => {
    if (type === 'income') return 'receita';
    if (type === 'expense') return 'despesa';
    return 'transferência';
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-55 flex flex-col items-end">
        {/* Card de Confirmação Rápida */}
        {recordingState === 'confirming' && extractedData && (
          <div className="mb-4 w-80 max-w-[90vw] bg-white/90 border border-slate-200 backdrop-blur-md shadow-2xl rounded-2xl p-5 animate-in slide-in-from-bottom-5 duration-200 flex flex-col gap-4 font-['Inter',sans-serif]">
            <div className="flex items-start justify-between">
              <span className="text-[10px] bg-teal-50 text-teal-700 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Confirmar Lançamento
              </span>
              <button 
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100 border-0 bg-transparent cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              Deseja criar uma <strong className="text-slate-900 font-black">{getTransactionTypeLabel(extractedData.tipo)}</strong> de{' '}
              <strong className="text-[#14b8a6] font-black">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extractedData.valor)}
              </strong>
              , no dia <strong className="text-slate-900 font-bold">{formatExtractedDate(extractedData.data)}</strong>, na conta{' '}
              <strong className="text-slate-900 font-bold">{getAccountName()}</strong>, na categoria{' '}
              <strong className="text-slate-900 font-bold">{getCategoryName()}</strong>?
            </p>

            <div className="grid grid-cols-3 gap-2">
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
                Ajustar
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

        {/* Botão de Controle Flutuante */}
        <div className="flex items-center gap-3">
          {/* Tag informativa temporária de gravação/processamento */}
          {recordingState === 'recording' && (
            <div className="bg-rose-500 text-white font-extrabold text-[10px] px-3.5 py-2 rounded-full shadow-lg animate-pulse flex items-center gap-2 tracking-wide">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              Gravando {timer}s / 30s
            </div>
          )}
          {recordingState === 'processing' && (
            <div className="bg-slate-800 text-white font-bold text-[10px] px-3.5 py-2 rounded-full shadow-lg flex items-center gap-2 tracking-wide">
              <Loader2 size={12} className="animate-spin text-teal-400" />
              Entendendo áudio...
            </div>
          )}

          {/* Botão Redondo Principal */}
          {recordingState !== 'confirming' && (
            <button
              onClick={recordingState === 'recording' ? stopRecording : startRecording}
              disabled={recordingState === 'processing'}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all active:scale-90 select-none outline-none cursor-pointer border-0 z-50 ${
                recordingState === 'recording'
                  ? 'bg-rose-600 hover:bg-rose-500 ring-4 ring-rose-600/20 animate-pulse'
                  : recordingState === 'processing'
                  ? 'bg-slate-700'
                  : 'bg-teal-600 hover:bg-teal-500 hover:scale-105 shadow-teal-600/20 ring-4 ring-teal-600/0 hover:ring-teal-600/10'
              }`}
              title={recordingState === 'recording' ? 'Parar gravação' : 'Lançamento rápido por voz (Gemini)'}
            >
              {recordingState === 'recording' ? (
                <Square size={20} className="fill-white" />
              ) : recordingState === 'processing' ? (
                <Loader2 size={24} className="animate-spin text-teal-400" />
              ) : (
                <Mic size={24} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Modal padrão completo se o usuário optar por Ajustar */}
      {isModalOpen && extractedData && (
        <FinancialTransactionModalV2
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleModalSuccess}
          initialType={extractedData.tipo}
          initialDescription={extractedData.descricao}
          initialAmount={extractedData.valor}
          initialDate={extractedData.data}
          initialAccountId={matchedAccountId}
        />
      )}
    </>
  );
}

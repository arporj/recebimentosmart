import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Loader2, Check, X, Pencil, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { criarTransacao } from '../../lib/financeiro/criarTransacao';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { editarTransacao } from '../../lib/financeiro/editarTransacao';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from './FinancialTransactionModalV2';
import { format, subDays, addDays, parseISO } from 'date-fns';

interface ExtractedData {
  acao: 'create' | 'delete' | 'confirm' | 'cancel' | 'update';
  descricao: string;
  valor: number;
  tipo: 'income' | 'expense' | 'transfer';
  data: string;
  banco_carteira?: string;
  categoria?: string;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  parcelas_total?: number;
  periodicidade?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recorrencia_intervalo?: number;
  update_fields?: {
    descricao?: string;
    valor?: number;
    data?: string;
    banco_carteira?: string;
    categoria?: string;
  };
}

interface SuccessDetails {
  actionType: 'create' | 'delete' | 'confirm' | 'update';
  message: string;
  createdTransactionId?: string;
  deletedTransactionBackup?: any;
  confirmedTransactionBackup?: { id: string; originalStatus: string; originalDate: string };
  updatedTransactionBackup?: { id: string; originalFields: any };
}

export function VoiceFloatingButton() {
  const { user } = useAuth();
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing' | 'confirming' | 'success_summary'>('idle');
  const [timer, setTimer] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  
  // Detalhes do sucesso silencioso (para rollback e resumo da mensagem)
  const [successDetails, setSuccessDetails] = useState<SuccessDetails | null>(null);
  const [countdown, setCountdown] = useState(5);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Edição local das variáveis de criação
  const [localDescription, setLocalDescription] = useState('');
  const [localAmount, setLocalAmount] = useState(0);
  const [localDate, setLocalDate] = useState('');
  
  // Novos estados locais de recorrência/parcelas do Artie
  const [localModalidade, setLocalModalidade] = useState<'unica' | 'parcelada' | 'recorrente'>('unica');
  const [localInstallmentTotal, setLocalInstallmentTotal] = useState(1);
  const [localPeriodicidade, setLocalPeriodicidade] = useState<'diaria' | 'semanal' | 'mensal' | 'anual'>('mensal');
  const [localRecurrenceInterval, setLocalRecurrenceInterval] = useState(1);
  
  // Seleções inteligentes
  const [matchedAccountId, setMatchedAccountId] = useState('');
  const [matchedCategoryId, setMatchedCategoryId] = useState('');
  
  // Exclusão / Confirmação
  const [matchedTransactionToDelete, setMatchedTransactionToDelete] = useState<any | null>(null);
  const [matchedTransactionToConfirm, setMatchedTransactionToConfirm] = useState<any | null>(null);
  const [matchedTransactionToUpdate, setMatchedTransactionToUpdate] = useState<any | null>(null);

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

  // Iniciar contador regressivo para o fechamento automático do sucesso silencioso
  const startSuccessCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    
    setCountdown(5);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          setRecordingState('idle');
          setExtractedData(null);
          setSuccessDetails(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Reverte as ações de criação, exclusão, confirmação e alteração
  const handleUndo = async () => {
    if (!successDetails) return;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    try {
      setRecordingState('processing');

      if (successDetails.actionType === 'create' && successDetails.createdTransactionId) {
        const { error } = await supabase.from('financial_transactions').delete().eq('id', successDetails.createdTransactionId);
        if (error) throw error;
        toast.success('Criação desfeita com sucesso! ↩️');
      } 
      else if (successDetails.actionType === 'delete' && successDetails.deletedTransactionBackup) {
        const { error } = await criarTransacao(successDetails.deletedTransactionBackup);
        if (error) throw error;
        toast.success('Exclusão desfeita com sucesso! ↩️');
      }
      else if (successDetails.actionType === 'confirm' && successDetails.confirmedTransactionBackup) {
        const { error } = await editarTransacao(
          successDetails.confirmedTransactionBackup.id, 
          {
            status: successDetails.confirmedTransactionBackup.originalStatus as any,
            date: successDetails.confirmedTransactionBackup.originalDate
          }, 
          'this'
        );
        if (error) throw error;
        toast.success('Confirmação desfeita! Lançamento pendente restaurado. ↩️');
      }
      else if (successDetails.actionType === 'update' && successDetails.updatedTransactionBackup) {
        const { error } = await editarTransacao(
          successDetails.updatedTransactionBackup.id,
          successDetails.updatedTransactionBackup.originalFields,
          'this'
        );
        if (error) throw error;
        toast.success('Alteração desfeita com sucesso! ↩️');
      }

      window.dispatchEvent(new CustomEvent('transaction_created'));

    } catch (err: any) {
      console.error('Erro ao desfazer ação:', err);
      toast.error('Não foi possível desfazer a ação.');
    } finally {
      setRecordingState('idle');
      setExtractedData(null);
      setSuccessDetails(null);
    }
  };

  // Busca direta de transações para exclusão
  const findTransactionToDeleteDirect = async (data: ExtractedData): Promise<any | null> => {
    if (!user) return null;
    try {
      const targetDate = parseISO(data.data);
      const startDateStr = format(subDays(targetDate, 2), 'yyyy-MM-dd');
      const endDateStr = format(addDays(targetDate, 2), 'yyyy-MM-dd');

      const { data: txList, error } = await supabase
        .from('financial_transactions')
        .select('id, description, amount, date, type, account_id, category_id, financial_accounts!account_id(name)')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (error) throw error;

      const matches = (txList || []).filter(tx => {
        const valMatch = !data.valor || data.valor === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return valMatch && (descClean.includes(searchClean) || searchClean.includes(descClean));
      });

      if (matches.length === 1) {
        return {
          id: matches[0].id,
          description: matches[0].description,
          amount: matches[0].amount,
          date: matches[0].date,
          type: matches[0].type,
          account_id: matches[0].account_id,
          category_id: matches[0].category_id,
          accountName: (matches[0] as any).financial_accounts?.name || 'Conta não especificada'
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Busca direta de transações para confirmação / alteração
  const findTransactionToConfirmDirect = async (data: ExtractedData): Promise<any | null> => {
    if (!user) return null;
    try {
      const targetDate = parseISO(data.data);
      const startDateStr = format(subDays(targetDate, 2), 'yyyy-MM-dd');
      const endDateStr = format(addDays(targetDate, 2), 'yyyy-MM-dd');

      const { data: txList, error } = await supabase
        .from('financial_transactions')
        .select('id, description, amount, date, type, account_id, category_id, status, financial_accounts!account_id(name)')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (error) throw error;

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

      const matches = (txList || []).filter(tx => {
        const valMatch = !data.valor || data.valor === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const isGeneric = isGenericDescription(data.descricao);
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descMatch = isGeneric || descClean.includes(searchClean) || searchClean.includes(descClean);
        return valMatch && descMatch;
      });

      const pendingMatches = matches.filter(tx => tx.status === 'pending');
      if (pendingMatches.length === 1) {
        return {
          id: pendingMatches[0].id,
          description: pendingMatches[0].description,
          amount: pendingMatches[0].amount,
          date: pendingMatches[0].date,
          type: pendingMatches[0].type,
          account_id: pendingMatches[0].account_id,
          category_id: pendingMatches[0].category_id,
          status: pendingMatches[0].status,
          accountName: (pendingMatches[0] as any).financial_accounts?.name || 'Conta não especificada'
        };
      }

      if (matches.length === 1) {
        return {
          id: matches[0].id,
          description: matches[0].description,
          amount: matches[0].amount,
          date: matches[0].date,
          type: matches[0].type,
          account_id: matches[0].account_id,
          category_id: matches[0].category_id,
          status: matches[0].status,
          accountName: (matches[0] as any).financial_accounts?.name || 'Conta não especificada'
        };
      }

      return null;
    } catch {
      return null;
    }
  };

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

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error('Resposta do servidor não é um JSON válido:', responseText);
        throw new Error('O assistente de voz do Artie está temporariamente indisponível. Por favor, tente novamente.');
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Não foi possível processar o comando de voz do Artie.');
      }

      const data: ExtractedData & {
        modalidade?: 'unica' | 'parcelada' | 'recorrente';
        parcelas_total?: number;
        periodicidade?: 'daily' | 'weekly' | 'monthly' | 'yearly';
        recorrencia_intervalo?: number;
      } = result.data;

      // Capitalizar descrição de forma inteligente (respeitando nomes próprios)
      if (data.descricao) {
        data.descricao = capitalizeDescription(data.descricao);
      }
      if (data.update_fields && data.update_fields.descricao) {
        data.update_fields.descricao = capitalizeDescription(data.update_fields.descricao);
      }

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

      // --- TOMADA DE DECISÃO INTELIGENTE: SUCESSO SILENCIOSO VS. INTERVENÇÃO ---
      
      if (data.acao === 'delete') {
        const matched = await findTransactionToDeleteDirect(data);
        if (matched) {
          // Executa exclusão silenciosa!
          try {
            const backupInput = {
              description: matched.description,
              amount: matched.amount,
              type: matched.type,
              date: matched.date,
              category_id: matched.category_id,
              account_id: matched.account_id,
              modalidade: 'unica' as const,
              status: 'paid' as const
            };

            const { error } = await deletarTransacao(matched.id);
            if (error) throw error;

            setSuccessDetails({
              actionType: 'delete',
              message: `Lançamento "${matched.description}" excluído com sucesso!`,
              deletedTransactionBackup: backupInput
            });
            window.dispatchEvent(new CustomEvent('transaction_created'));
            setRecordingState('success_summary');
            startSuccessCountdown();
            return;
          } catch (err) {
            console.error('Falha na exclusão silenciosa:', err);
          }
        }
        
        // Ambiguidade ou não encontrado -> abre modal tradicional de exclusão
        await findAndSetTransactionToDelete(data);
        setRecordingState('confirming');

      } else if (data.acao === 'confirm') {
        const matched = await findTransactionToConfirmDirect(data);
        if (matched) {
          // Executa confirmação silenciosa!
          try {
            const { error } = await editarTransacao(matched.id, {
              status: 'paid',
              date: data.data || matched.date
            }, 'this');
            if (error) throw error;

            setSuccessDetails({
              actionType: 'confirm',
              message: `Lançamento "${matched.description}" confirmado hoje!`,
              confirmedTransactionBackup: { id: matched.id, originalStatus: 'pending', originalDate: matched.date }
            });
            window.dispatchEvent(new CustomEvent('transaction_created'));
            setRecordingState('success_summary');
            startSuccessCountdown();
            return;
          } catch (err) {
            console.error('Falha na confirmação silenciosa:', err);
          }
        }

        // Ambiguidade ou não encontrado -> abre modal tradicional de confirmação
        await findAndSetTransactionToConfirm(data);
        setRecordingState('confirming');

      } else if (data.acao === 'update') {
        const matched = await findTransactionToConfirmDirect(data); // Reusa fuzzy match de busca
        const newFields = data.update_fields;
        
        if (matched && newFields && (newFields.descricao || newFields.valor || newFields.data || newFields.banco_carteira || newFields.categoria)) {
          // Executa alteração silenciosa!
          try {
            const updatePayload: any = {};
            const originalFields: any = {};

            if (newFields.descricao) {
              updatePayload.description = newFields.descricao;
              originalFields.description = matched.description;
            }
            if (newFields.valor) {
              updatePayload.amount = newFields.valor;
              originalFields.amount = matched.amount;
            }
            if (newFields.data) {
              updatePayload.date = newFields.data;
              originalFields.date = matched.date;
            }
            if (newFields.banco_carteira) {
              const matchedAccId = matchAccount(newFields.banco_carteira, accounts);
              if (matchedAccId) {
                updatePayload.account_id = matchedAccId;
                originalFields.account_id = matched.account_id;
              }
            }
            if (newFields.categoria) {
              const matchedCatId = matchCategory(newFields.categoria, categories);
              if (matchedCatId) {
                updatePayload.category_id = matchedCatId;
                originalFields.category_id = matched.category_id;
              }
            }

            if (Object.keys(updatePayload).length > 0) {
              const { error } = await editarTransacao(matched.id, updatePayload, 'this');
              if (error) throw error;

              setSuccessDetails({
                actionType: 'update',
                message: `Lançamento "${matched.description}" alterado com sucesso!`,
                updatedTransactionBackup: { id: matched.id, originalFields }
              });
              window.dispatchEvent(new CustomEvent('transaction_created'));
              setRecordingState('success_summary');
              startSuccessCountdown();
              return;
            }
          } catch (err) {
            console.error('Falha na alteração silenciosa:', err);
          }
        }

        // Ambiguidade ou erro de busca -> abre modal tradicional no modo de confirmação de existente
        await findAndSetTransactionToConfirm(data);
        setRecordingState('confirming');

      } else {
        // Fluxo de correspondência inteligente de criação
        const suggestedBank = data.banco_carteira || '';
        const matchedAccId = suggestedBank ? matchAccount(suggestedBank, accounts) : '';
        
        const suggestedCat = data.categoria || '';
        const matchedCatId = suggestedCat ? matchCategory(suggestedCat, categories) : '';

        // Definindo se há dúvidas
        // 1. Usuário citou banco mas não achamos match exato
        const bankDoubt = suggestedBank && !matchedAccId;
        // 2. Usuário citou categoria mas não achamos match exato
        const categoryDoubt = suggestedCat && !matchedCatId;
        // 3. Faltam dados críticos como descrição ou valor <= 0
        const dataInvalid = !data.descricao || !data.valor || data.valor <= 0;

        if (bankDoubt || categoryDoubt || dataInvalid) {
          // Há dúvida! Abre o modal para preenchimento manual
          setMatchedAccountId(matchedAccId);
          setMatchedCategoryId(matchedCatId);
          setRecordingState('confirming');
        } else {
          // Não há dúvidas! Executa criação silenciosa (aceitando conta/categoria como nulas se não mencionadas)
          try {
            const transacaoInput = {
              description: data.descricao,
              amount: data.valor,
              type: data.tipo,
              date: data.data,
              category_id: matchedCatId || undefined,
              account_id: matchedAccId || undefined,
              modalidade: data.modalidade || 'unica',
              status: 'paid' as const,
              installment_total: data.modalidade === 'parcelada' ? data.parcelas_total : undefined,
              recurrence_period: data.modalidade === 'recorrente' ? (data.periodicidade === 'daily' ? 'daily' : data.periodicidade === 'weekly' ? 'weekly' : data.periodicidade === 'yearly' ? 'yearly' : 'monthly') : undefined,
              recurrence_interval: data.modalidade === 'recorrente' ? data.recorrencia_intervalo : undefined
            };

            const { data: createdTx, error } = await criarTransacao(transacaoInput);
            if (error) throw error;

            setSuccessDetails({
              actionType: 'create',
              message: `Lançamento "${data.descricao}" criado com sucesso!`,
              createdTransactionId: createdTx?.id
            });
            window.dispatchEvent(new CustomEvent('transaction_created'));
            setRecordingState('success_summary');
            startSuccessCountdown();
          } catch (err) {
            console.error('Falha na criação silenciosa:', err);
            // Fallback: abre o modal tradicional
            setMatchedAccountId(matchedAccId);
            setMatchedCategoryId(matchedCatId);
            setRecordingState('confirming');
          }
        }
      }

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
        const valMatch = !data.valor || data.valor === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
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
        const valMatch = !data.valor || data.valor === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
        const isGeneric = isGenericDescription(data.descricao);
        const descClean = tx.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchClean = data.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descMatch = isGeneric || descClean.includes(searchClean) || searchClean.includes(descClean);
        return valMatch && descMatch && tx.status === 'pending';
      });

      const match = pendingMatch || (txList || []).find(tx => {
        const valMatch = !data.valor || data.valor === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(data.valor)) < 0.05;
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

  const capitalizeDescription = (desc: string): string => {
    if (!desc) return '';
    const lowercasePrepositions = ['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'para', 'com', 'o', 'a', 'um', 'uma'];
    return desc
      .split(' ')
      .map((word, index) => {
        if (!word) return '';
        const wordLower = word.toLowerCase();
        // Sempre capitaliza a primeira palavra. As outras apenas se não forem preposições/artigos curtos.
        if (index === 0 || !lowercasePrepositions.includes(wordLower)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return wordLower;
      })
      .join(' ');
  };

  const matchAccount = (suggestedBank: string, accountsList: any[]): string => {
    if (accountsList.length === 0) return '';

    const creditCards = accountsList.filter(a => a.type === 'credit_card');
    const checkings = accountsList.filter(a => a.type === 'checking' || a.type === 'savings' || a.type === 'investment');

    const textLower = suggestedBank.toLowerCase();
    const isMentioningCard = textLower.includes('cartao') || textLower.includes('cartão') || textLower.includes('credito') || textLower.includes('crédito');
    const isMentioningCashOrChecking = textLower.includes('pix') || textLower.includes('debito') || textLower.includes('débito') || textLower.includes('dinheiro') || textLower.includes('carteira') || textLower.includes('conta') || textLower.includes('poupança') || textLower.includes('poupanca') || textLower.includes('transferência') || textLower.includes('transferencia');

    // Regra para cartão
    if (isMentioningCard) {
      if (creditCards.length === 1) {
        return creditCards[0].id;
      }
      if (creditCards.length > 1) {
        // Tenta dar match aproximado apenas nos cartões
        const bankClean = suggestedBank.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matchedCard = creditCards.find(acc => {
          const accNameClean = acc.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return accNameClean.includes(bankClean) || bankClean.includes(accNameClean);
        });
        if (matchedCard) return matchedCard.id;
      }
    }

    // Regra para conta corrente/checking
    if (isMentioningCashOrChecking) {
      if (checkings.length === 1) {
        return checkings[0].id;
      }
      if (checkings.length > 1) {
        const bankClean = suggestedBank.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matchedChecking = checkings.find(acc => {
          const accNameClean = acc.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return accNameClean.includes(bankClean) || bankClean.includes(accNameClean);
        });
        if (matchedChecking) return matchedChecking.id;
      }
    }

    // Fuzzy matching por nome aproximado geral
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
        status: 'paid',
        date: localDate || matchedTransactionToConfirm.date
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
                Assistente Artie
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

                <div className="p-3.5 bg-teal-50/20 rounded-2xl border border-teal-100/40 text-[10px] text-slate-700 leading-relaxed font-semibold shadow-inner">
                  <p className="mb-2 text-[9px] font-black uppercase text-[#14b8a6] tracking-wider flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#14b8a6]" />
                    Guia de Comandos do Artie:
                  </p>
                  <div className="space-y-2 text-[10px] text-slate-600 font-bold">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#14b8a6] text-[11px] select-none leading-none pt-0.5">📝</span>
                      <div>
                        <span className="font-extrabold text-slate-800">Lançar Novo: </span>
                        <span className="text-slate-500 font-semibold italic">"Paguei 50 reais de gasolina na conta Inter"</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#14b8a6] text-[11px] select-none leading-none pt-0.5">✅</span>
                      <div>
                        <span className="font-extrabold text-slate-800">Dar Baixa: </span>
                        <span className="text-slate-500 font-semibold italic">"Confirme para hoje o IPTU que tem para amanhã"</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#14b8a6] text-[11px] select-none leading-none pt-0.5">✏️</span>
                      <div>
                        <span className="font-extrabold text-slate-800">Alterar Registro: </span>
                        <span className="text-slate-500 font-semibold italic">"Altere o almoço de hoje para 15 reais"</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#14b8a6] text-[11px] select-none leading-none pt-0.5">🗑️</span>
                      <div>
                        <span className="font-extrabold text-slate-800">Excluir Registro: </span>
                        <span className="text-slate-500 font-semibold italic">"Exclua o churrasco de ontem de 80 reais"</span>
                      </div>
                    </div>
                  </div>
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
                  <p className="text-xs font-bold text-slate-800">Artie está ouvindo...</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Fale o que deseja lançar</p>
                </div>
              </div>
            )}

            {/* ESTADO 4: Resumo de Sucesso Silencioso */}
            {recordingState === 'success_summary' && successDetails && (
              <div className="flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start gap-3 bg-teal-50/50 border border-teal-100 p-3.5 rounded-2xl">
                  <div className="bg-teal-600 text-white p-2 rounded-xl shrink-0 flex items-center justify-center">
                    <Check size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-extrabold text-slate-800 leading-tight">Sucesso Silencioso</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-relaxed">
                      {successDetails.message}
                    </p>
                  </div>
                </div>

                {/* Barra Visual de Contagem Regressiva */}
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-teal-600 h-1 transition-all duration-1000 ease-linear rounded-full" 
                    style={{ width: `${(countdown / 5) * 100}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={handleUndo}
                    className="py-2 px-3 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-white"
                  >
                    <RotateCcw size={12} />
                    Desfazer ({countdown}s)
                  </button>
                  <button
                    onClick={() => {
                      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                      // Abre o modal de detalhes para editar
                      setRecordingState('idle');
                      setIsModalOpen(true);
                    }}
                    className="py-2 px-3 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-700 hover:bg-slate-200 border-0 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil size={12} />
                    Editar Lançamento
                  </button>
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
                          , referente a <strong className="text-slate-900 font-bold">"{matchedTransactionToConfirm.description}"</strong>?
                        </p>

                        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/50 flex flex-col gap-2.5">
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Data do Pagamento</label>
                            <input
                              type="date"
                              value={localDate}
                              onChange={(e) => setLocalDate(e.target.value)}
                              className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none"
                            />
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold leading-normal border-t border-slate-200/60 pt-2 flex flex-col gap-0.5">
                            <span>Vencimento original: {formatExtractedDate(matchedTransactionToConfirm.date)}</span>
                            <span>Conta: {matchedTransactionToConfirm.accountName}</span>
                          </div>
                        </div>

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
                          Nenhum lançamento pendente <strong className="text-slate-900">"{extractedData.descricao || 'não especificado'}"</strong>{' '}
                          {extractedData.valor > 0 && (
                            <>
                              no valor de{' '}
                              <strong className="text-slate-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extractedData.valor)}
                              </strong>{' '}
                            </>
                          )}
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
        {(recordingState === 'idle' || recordingState === 'confirming' || recordingState === 'success_summary') && (
          <button
            onClick={startRecording}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all hover:scale-105 shadow-teal-600/20 ring-4 ring-teal-600/0 hover:ring-teal-600/10 bg-teal-600 hover:bg-teal-500 select-none outline-none cursor-pointer border-0 z-50 animate-bounce duration-1000"
            style={{ animationDuration: '3s' }}
            title="Fale com Artie — seu assistente financeiro por voz"
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

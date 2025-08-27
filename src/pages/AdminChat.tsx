import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Tipos para os dados
interface Conversation {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  profile?: { name: string };
}

interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// Componente da Lista de Conversas
const ConversationList: React.FC<{ 
  conversations: Conversation[];
  onSelect: (conversation: Conversation) => void;
  selectedConversationId: string | null;
  showClosed: boolean;
  setShowClosed: (show: boolean) => void;
}> = ({ conversations, onSelect, selectedConversationId, showClosed, setShowClosed }) => {

  const filteredConversations = useMemo(() => {
    if (showClosed) {
      return conversations;
    }
    return conversations.filter(c => c.status === 'open');
  }, [conversations, showClosed]);

  return (
    <div className="w-1/3 border-r border-gray-200 overflow-y-auto flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-bold text-lg">Conversas</h2>
        <div className="mt-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="rounded text-custom focus:ring-custom"
            />
            <span className="text-sm">Mostrar finalizadas</span>
          </label>
        </div>
      </div>
      <ul className="flex-grow">
        {filteredConversations.map(convo => (
          <li 
            key={convo.id} 
            onClick={() => onSelect(convo)}
            className={`p-4 cursor-pointer hover:bg-gray-100 ${selectedConversationId === convo.id ? 'bg-gray-200' : ''}`}>
            <p className="font-semibold">{convo.profile?.name || 'Usuário Desconhecido'}</p>
            <p className="text-sm text-gray-500">ID: {convo.user_id.substring(0, 8)}</p>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${convo.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {convo.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Componente da Janela de Mensagens
const MessageWindow: React.FC<{ 
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onCloseConversation: (id: string) => void;
}> = ({ conversation, messages, onSendMessage, onCloseConversation }) => {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim() && conversation) {
      onSendMessage(content);
      setContent('');
    }
  };

  if (!conversation) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Selecione uma conversa para começar</div>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="p-4 border-b flex justify-between items-center">
        <h3 className="font-bold">{conversation.profile?.name || 'Chat'}</h3>
        {conversation.status === 'open' && (
          <button 
            onClick={() => onCloseConversation(conversation.id)}
            className="flex items-center text-sm bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 transition-colors"
          >
            <XCircle size={16} className="mr-1" />
            Finalizar Atendimento
          </button>
        )}
      </header>
      <main className="flex-1 p-4 overflow-y-auto bg-gray-50">
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-md px-4 py-2 rounded-xl ${msg.sender_id === user?.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                <p>{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>
      <footer className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex items-center">
          <input 
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={conversation.status === 'open' ? "Digite sua resposta..." : "Esta conversa foi finalizada."}
            disabled={conversation.status !== 'open'}
            className="flex-1 px-3 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-custom disabled:bg-gray-100"
          />
          <button 
            type="submit" 
            disabled={conversation.status !== 'open'}
            className="ml-2 bg-custom text-white rounded-full p-3 hover:bg-custom-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </form>
      </footer>
    </div>
  );
};

// Componente Principal da Página de Chat do Admin
const AdminChatPage: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-conversations');
      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Falha ao carregar conversas.');
    } finally {
      setLoading(false);
    }
  };

  // Busca inicial e realtime para novas conversas
  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel('public:conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, 
        () => fetchConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Busca mensagens da conversa selecionada
  useEffect(() => {
    if (!selectedConversation) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
      }
    };
    fetchMessages();

    const messageChannel = supabase
      .channel(`messages:${selectedConversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` }, 
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(messageChannel); };
  }, [selectedConversation]);

  const handleSendMessage = async (content: string) => {
    if (!selectedConversation || !user) return;
    await supabase.from('messages').insert({
      content,
      conversation_id: selectedConversation.id,
      sender_id: user.id,
    });
  };

  const handleCloseConversation = async (conversation_id: string) => {
    try {
      const { error } = await supabase.functions.invoke('update-conversation-status', {
        body: { conversation_id, status: 'closed' },
      });
      if (error) throw error;

      toast.success('Conversa finalizada!');
      // Atualiza a lista para refletir a mudança de status
      setConversations(prev => 
        prev.map(c => c.id === conversation_id ? { ...c, status: 'closed' } : c)
      );
      // Limpa a seleção se a conversa fechada era a selecionada
      if (selectedConversation?.id === conversation_id) {
        setSelectedConversation(null);
      }
    } catch (error) {
      console.error('Error closing conversation:', error);
      toast.error('Falha ao finalizar a conversa.');
    }
  };

  if (loading) {
    return <div className="text-center p-8">Carregando conversas...</div>;
  }

  return (
    <div className="h-[calc(100vh-128px)] flex bg-white border rounded-lg shadow-md">
      <ConversationList 
        conversations={conversations} 
        onSelect={setSelectedConversation} 
        selectedConversationId={selectedConversation?.id || null}
        showClosed={showClosed}
        setShowClosed={setShowClosed}
      />
      <MessageWindow 
        conversation={selectedConversation} 
        messages={messages} 
        onSendMessage={handleSendMessage}
        onCloseConversation={handleCloseConversation}
      />
    </div>
  );
};

export default AdminChatPage;

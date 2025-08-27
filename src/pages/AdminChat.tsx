import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Tipos para os dados
interface Conversation {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  profiles: { name: string; avatar_url: string } | null;
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
}> = ({ conversations, onSelect, selectedConversationId }) => (
  <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
    <h2 className="p-4 font-bold text-lg border-b">Conversas</h2>
    <ul>
      {conversations.map(convo => (
        <li 
          key={convo.id} 
          onClick={() => onSelect(convo)}
          className={`p-4 cursor-pointer hover:bg-gray-100 ${selectedConversationId === convo.id ? 'bg-gray-200' : ''}`}>
          <p className="font-semibold">{convo.profiles?.name || 'Usuário Desconhecido'}</p>
          <p className="text-sm text-gray-500">ID: {convo.user_id.substring(0, 8)}</p>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${convo.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {convo.status}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

// Componente da Janela de Mensagens
const MessageWindow: React.FC<{ 
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
}> = ({ conversation, messages, onSendMessage }) => {
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
      <header className="p-4 border-b font-bold">{conversation.profiles?.name || 'Chat'}</header>
      <main className="flex-1 p-4 overflow-y-auto bg-gray-50">
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-md px-4 py-2 rounded-xl ${msg.sender_id === user?.id ? 'bg-custom text-white' : 'bg-gray-200 text-gray-800'}`}>
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
            placeholder="Digite sua resposta..."
            className="flex-1 px-3 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-custom"
          />
          <button type="submit" className="ml-2 bg-custom text-white rounded-full p-3 hover:bg-custom-hover">Enviar</button>
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

  // Busca conversas
  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      try {
        // 1. Fetch conversations
        const { data: convosData, error: convosError } = await supabase
          .from('conversations')
          .select(`*`)
          .order('created_at', { ascending: false });

        if (convosError) throw convosError;
        if (!convosData) return;

        // 2. Get unique user IDs
        const userIds = [...new Set(convosData.map(c => c.user_id))];

        // 3. Fetch corresponding profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select(`id, name, avatar_url`)
          .in('id', userIds);

        if (profilesError) throw profilesError;

        // 4. Create a map for easy lookup
        const profilesMap = new Map(profilesData.map(p => [p.id, p]));

        // 5. Combine the data
        const combinedData = convosData.map(convo => ({
          ...convo,
          profile: profilesMap.get(convo.user_id)
        }));

        setConversations(combinedData as Conversation[]);

      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();

    // Realtime para novas conversas
    const channel = supabase
      .channel('public:conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, 
        (payload) => {
          // Refetch all conversations to get the profile info
          fetchConversations();
        }
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
        setMessages(data);
      }
    };
    fetchMessages();

    // Realtime para novas mensagens na conversa selecionada
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

  if (loading) {
    return <div className="text-center p-8">Carregando conversas...</div>;
  }

  return (
    <div className="h-[calc(100vh-128px)] flex bg-white border rounded-lg shadow-md">
      <ConversationList 
        conversations={conversations} 
        onSelect={setSelectedConversation} 
        selectedConversationId={selectedConversation?.id || null}
      />
      <MessageWindow 
        conversation={selectedConversation} 
        messages={messages} 
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default AdminChatPage;

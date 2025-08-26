import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Conversation, Message } from '../types/chat';
import toast from 'react-hot-toast';

interface ChatContextType {
  isOpen: boolean;
  toggleChat: () => void;
  messages: Message[];
  sendMessage: (content: string) => Promise<void>;
  loading: boolean;
  unreadMessages: number;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

  console.log('ChatProvider: Initializing. User:', user);

  const getConversation = useCallback(async () => {
    if (!user) {
      console.log('ChatProvider: getConversation - No user, exiting.');
      return null;
    }
    console.log('ChatProvider: getConversation - Fetching for user:', user.id);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore 'single row not found'
        throw new Error(`Supabase error fetching conversation: ${error.message}`);
      }
      
      console.log('ChatProvider: getConversation - Fetched data:', data);
      setConversation(data);
      return data;
    } catch (error) {
      console.error('[ChatProvider] Error in getConversation:', error);
      toast.error('Erro ao carregar o chat.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createConversation = async () => {
    if (!user) return null;
    console.log('ChatProvider: createConversation - Creating for user:', user.id);

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw new Error(`Supabase error creating conversation: ${error.message}`);
      
      console.log('ChatProvider: createConversation - Created data:', data);
      setConversation(data);
      return data;
    } catch (error) {
      console.error('[ChatProvider] Error in createConversation:', error);
      toast.error('Não foi possível iniciar o chat. Tente novamente.');
      return null;
    }
  };

  useEffect(() => {
    if (!user) {
      console.log('ChatProvider: Main useEffect - No user, skipping.');
      return;
    }
    if (!conversation) {
      console.log('ChatProvider: Main useEffect - No conversation, skipping.');
      return;
    }

    console.log('ChatProvider: Main useEffect - Setting up for conversation:', conversation.id);

    const fetchMessages = async () => {
      console.log('ChatProvider: fetchMessages - Fetching for conversation:', conversation.id);
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });

        if (error) throw new Error(`Supabase error fetching messages: ${error.message}`);
        console.log('ChatProvider: fetchMessages - Fetched messages:', data);
        setMessages(data || []);
      } catch (error) {
        console.error('[ChatProvider] Error in fetchMessages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    try {
      console.log('ChatProvider: Subscribing to realtime channel...');
      const channel = supabase
        .channel(`messages:${conversation.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, 
          (payload) => {
            console.log('ChatProvider: Realtime message received:', payload.new);
            const newMessage = payload.new as Message;
            setMessages((prev) => [...prev, newMessage]);
            if (!isOpen && newMessage.sender_id !== user.id) {
              setUnreadMessages(prev => prev + 1);
              toast.success('Nova mensagem do suporte!');
            }
          }
        )
        .subscribe((status, err) => {
          if (err) {
            console.error('[ChatProvider] Realtime subscription error:', err);
          }
          console.log('[ChatProvider] Realtime status:', status);
        });

      return () => {
        console.log('ChatProvider: Unsubscribing from realtime channel.');
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error('[ChatProvider] Failed to subscribe to realtime channel:', error);
    }

  }, [user, conversation, isOpen]);

  useEffect(() => {
    if (user) {
      console.log('ChatProvider: User found, attempting to get conversation.');
      getConversation();
    } else {
      console.log('ChatProvider: No user yet.');
    }
  }, [user, getConversation]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadMessages(0);
    }
  };

  const sendMessage = async (content: string) => {
    if (!user || !content.trim()) return;

    let currentConversation = conversation;
    if (!currentConversation) {
      console.log('ChatProvider: sendMessage - No current conversation, creating one.');
      currentConversation = await createConversation();
    }

    if (!currentConversation) {
      console.error('[ChatProvider] sendMessage - Failed to get or create a conversation.');
      return;
    }

    try {
      const { error } = await supabase.from('messages').insert({
        content,
        conversation_id: currentConversation.id,
        sender_id: user.id,
      });

      if (error) throw new Error(`Supabase error sending message: ${error.message}`);

    } catch (error) {
      console.error('[ChatProvider] Error in sendMessage:', error);
      toast.error('Erro ao enviar mensagem.');
    }
  };

  return (
    <ChatContext.Provider value={{ isOpen, toggleChat, messages, sendMessage, loading, unreadMessages }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

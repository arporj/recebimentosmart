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

  const getConversation = useCallback(async () => {
    if (!user) return null;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(`Supabase error fetching conversation: ${error.message}`);
      }
      
      const currentConversation = data && data.length > 0 ? data[0] : null;
      setConversation(currentConversation);
      return currentConversation;
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

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw new Error(`Supabase error creating conversation: ${error.message}`);
      
      setConversation(data);
      return data;
    } catch (error) {
      console.error('[ChatProvider] Error in createConversation:', error);
      toast.error('Não foi possível iniciar o chat. Tente novamente.');
      return null;
    }
  };

  useEffect(() => {
    if (!user || !conversation) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });

        if (error) throw new Error(`Supabase error fetching messages: ${error.message}`);
        setMessages(data || []);
      } catch (error) {
        console.error('[ChatProvider] Error in fetchMessages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, 
        (payload) => {
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
      });

    return () => {
      supabase.removeChannel(channel);
    };

  }, [user, conversation, isOpen]);

  useEffect(() => {
    if (user) {
      getConversation();
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

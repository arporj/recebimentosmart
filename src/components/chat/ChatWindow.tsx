import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { Send } from 'lucide-react';

export const ChatWindow: React.FC = () => {
  const { isOpen, messages, sendMessage, loading } = useChat();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      sendMessage(content);
      setContent('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-5 z-50 w-80 h-96 bg-white rounded-lg shadow-xl flex flex-col border border-gray-200">
      <header className="bg-custom text-white p-4 rounded-t-lg">
        <h3 className="font-bold text-lg">Suporte</h3>
      </header>

      <main className="flex-1 p-4 overflow-y-auto bg-gray-50">
        {loading && <p className="text-center text-gray-500">Carregando...</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-gray-500">Olá! Como podemos ajudar?</p>
        )}
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-4 py-2 rounded-xl ${msg.sender_id === user?.id ? 'bg-custom text-white' : 'bg-gray-200 text-gray-800'}`}>
                <p>{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="p-2 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex items-center">
          <input 
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-3 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-custom"
          />
          <button type="submit" className="ml-2 bg-custom text-white rounded-full p-3 hover:bg-custom-hover transition-colors" aria-label="Enviar mensagem">
            <Send size={20} />
          </button>
        </form>
      </footer>
    </div>
  );
};

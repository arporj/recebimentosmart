import React from 'react';
import { useChat } from '../../contexts/ChatContext';
import { MessageSquare, X } from 'lucide-react';

export const ChatWidget: React.FC = () => {
  const { isOpen, toggleChat, unreadMessages } = useChat();

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <button 
        onClick={toggleChat} 
        className="bg-custom text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg hover:bg-custom-hover transition-transform transform hover:scale-110"
        aria-label="Abrir chat"
      >
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
        {unreadMessages > 0 && !isOpen && (
          <span className="absolute top-0 right-0 block h-6 w-6 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center border-2 border-white">
            {unreadMessages}
          </span>
        )}
      </button>
    </div>
  );
};

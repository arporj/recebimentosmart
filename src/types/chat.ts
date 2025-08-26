export interface Conversation {
  id: string;
  user_id: string;
  created_at: string;
  status: 'open' | 'closed';
}

export interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  type: 'Crítica' | 'Sugestão' | 'Outro';
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  has_unread_admin: boolean;
  has_unread_user: boolean;
  user?: {
    email: string;
    user_metadata: {
      name?: string;
    };
  };
}

export interface FeedbackMessage {
  id: string;
  feedback_id: string;
  sender_id: string | null;
  message: string;
  created_at: string;
}

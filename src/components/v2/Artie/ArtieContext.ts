import { createContext, useContext } from 'react';
import type {
  ArtieMessage,
  ArtieChatState,
  ArtieEntityContext,
  ArtieUserMemory,
  PendingAction,
} from '../../../lib/artie/types';
import type { PendingScopeAction } from './ArtieConfirmCard';

export interface ArtieContextValue {
  isOpen: boolean;
  openArtie: () => void;
  closeArtie: () => void;
  toggleArtie: () => void;

  messages: ArtieMessage[];
  chatState: ArtieChatState;
  pendingAction: PendingAction | null;
  pendingScopeAction: PendingScopeAction | null;

  sendTextMessage: (text: string) => Promise<void>;
  sendAudio: (audioBlob: Blob, mimeType: string) => Promise<void>;
  confirmPendingAction: () => Promise<void>;
  confirmScopeAction: (scope: 'this' | 'following') => Promise<void>;
  cancelPendingAction: () => void;
  clearHistory: () => void;

  entityContext: ArtieEntityContext;
  userMemory: Partial<ArtieUserMemory> | null;
}

export const ArtieContext = createContext<ArtieContextValue | null>(null);

export function useArtie(): ArtieContextValue {
  const ctx = useContext(ArtieContext);
  if (!ctx) throw new Error('useArtie deve ser usado dentro de <ArtieProvider>');
  return ctx;
}

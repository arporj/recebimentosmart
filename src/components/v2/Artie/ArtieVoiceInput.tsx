// ArtieVoiceInput — Botão push-to-talk estilo WhatsApp
// Segurar = grava, soltar = processa. Funciona com mouse e touch.

import { useState, useRef, useCallback } from 'react';
import { Mic } from 'lucide-react';

const MIN_RECORDING_MS = 500;  // Mínimo de 500ms para considerar gravação válida
const MIN_BLOB_SIZE_BYTES = 1000; // Mínimo de 1KB para considerar áudio com conteúdo

interface ArtieVoiceInputProps {
  onAudioReady: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}

export function ArtieVoiceInput({ onAudioReady, disabled }: ArtieVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    if (disabled || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      recordingStartRef.current = Date.now();

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const elapsed = Date.now() - recordingStartRef.current;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Ignora silenciosamente cliques rápidos ou áudio vazio
        if (elapsed >= MIN_RECORDING_MS && blob.size >= MIN_BLOB_SIZE_BYTES) {
          onAudioReady(blob, 'audio/webm');
        }

        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => {
          if (t >= 59) {
            stopRecording();
            return 60;
          }
          return t + 1;
        });
      }, 1000);
    } catch {
      // Permissão negada ou microfone indisponível
    }
  }, [disabled, isRecording, onAudioReady]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  return (
    <div className="relative flex items-center">
      {/* Indicador de tempo durante gravação */}
      {isRecording && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-xs font-mono text-red-500 animate-pulse bg-white px-2 py-0.5 rounded-full shadow-sm border border-red-200">
          {recordingTime}s
        </span>
      )}

      <button
        type="button"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startRecording(); }}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        disabled={disabled}
        aria-label={isRecording ? 'Gravando... Solte para enviar' : 'Segure para gravar'}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 select-none touch-none
          ${isRecording
            ? 'bg-red-500 scale-110 shadow-lg shadow-red-200 ring-4 ring-red-200 ring-opacity-60'
            : disabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-teal-500 text-white hover:bg-teal-600 active:scale-95 cursor-pointer shadow-sm'
          }
        `}
      >
        <Mic size={18} className={`${isRecording ? 'text-white' : ''} pointer-events-none`} />
        {isRecording && (
          <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-40" />
        )}
      </button>
    </div>
  );
}

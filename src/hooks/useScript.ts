// src/hooks/useScript.ts
import { useState, useEffect } from 'react';

type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';

function useScript(src: string): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(() => {
    if (typeof window === 'undefined') {
      return 'loading'; // SSR
    }
    const existingScript = document.querySelector(`script[src="${src}"]`);
    return existingScript ? 'ready' : 'loading';
  });

  useEffect(() => {
    if (status === 'ready') return;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => setStatus('ready');
    script.onerror = () => setStatus('error');

    document.body.appendChild(script);

    return () => {
      // Limpeza opcional: remover o script quando o componente desmontar
      // document.body.removeChild(script);
    };
  }, [src, status]);

  return status;
}

export default useScript;
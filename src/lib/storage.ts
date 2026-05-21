export function setRememberMe(value: boolean) {
  if (typeof window === 'undefined') return;
  
  if (value) {
    window.localStorage.setItem('recebimento_smart_remember', 'true');
    document.cookie = "recebimento_smart_remember=true; path=/; max-age=31536000"; // 1 year
  } else {
    window.localStorage.removeItem('recebimento_smart_remember');
    document.cookie = "recebimento_smart_remember=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

export function getIsRemembered(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.localStorage.getItem('recebimento_smart_remember') === 'true' || 
         document.cookie.includes('recebimento_smart_remember=true');
}

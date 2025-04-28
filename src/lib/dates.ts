import { format, parseISO } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const SP_TIMEZONE = 'America/Sao_Paulo';

export function formatToSP(date: Date | string | null, formatStr: string): string {
  if (!date) return 'Nunca';
  
  try {
    // First, ensure we have a Date object
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    // Convert UTC to São Paulo time without modifying the actual time
    const spDate = utcToZonedTime(dateObj, SP_TIMEZONE);
    
    // Format the date
    return format(spDate, formatStr, { locale: ptBR });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Data inválida';
  }
}

export function toSPDate(date: Date | string): Date {
  try {
    // First, ensure we have a Date object
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    // Convert to São Paulo timezone preserving the local time
    return utcToZonedTime(dateObj, SP_TIMEZONE);
  } catch (error) {
    console.error('Error converting to SP timezone:', error);
    return new Date(date);
  }
}

export function getCurrentSPDate(): Date {
  const now = new Date();
  return utcToZonedTime(now, SP_TIMEZONE);
}

export function convertToUTC(date: Date | string): string {
  try {
    // First, ensure we have a Date object
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    // Convert the local time to UTC considering it's in SP timezone
    const utcDate = zonedTimeToUtc(dateObj, SP_TIMEZONE);
    
    return utcDate.toISOString();
  } catch (error) {
    console.error('Error converting to UTC:', error);
    return new Date(date).toISOString();
  }
}
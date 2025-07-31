// src/hooks/useCurrencyMask.ts
import { useState, useCallback } from 'react';

export const formatCurrency = (value: string | number): string => {
  const stringValue = String(value).replace(/\D/g, '');
  if (!stringValue) return '';

  const numberValue = parseInt(stringValue, 10) / 100;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numberValue);
};

export const parseCurrency = (value: string): number => {
    const numericValue = value.replace(/\D/g, '');
    if (!numericValue) return 0;
    return parseInt(numericValue, 10);
};


export const useCurrencyMask = (initialValue: number = 0) => {
  const [displayValue, setDisplayValue] = useState<string>(() => formatCurrency(initialValue));
  const [numericValue, setNumericValue] = useState<number>(initialValue);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const newNumericValue = parseCurrency(rawValue);
    
    setNumericValue(newNumericValue);
    setDisplayValue(formatCurrency(newNumericValue));
  }, []);

  const setValue = useCallback((value: number) => {
    setNumericValue(value);
    setDisplayValue(formatCurrency(value));
  }, []);


  return {
    displayValue,
    numericValue,
    handleChange,
    setValue,
  };
};

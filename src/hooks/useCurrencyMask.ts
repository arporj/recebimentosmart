// src/hooks/useCurrencyMask.ts
import { useState, useCallback } from 'react';

export const formatCurrency = (value: number): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    return ''; 
  }

  const numberValue = value / 100; // Assume que o valor está em centavos

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2, // Garante sempre 2 casas decimais
    maximumFractionDigits: 2,
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

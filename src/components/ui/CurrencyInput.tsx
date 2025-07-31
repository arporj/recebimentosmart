// src/components/ui/CurrencyInput.tsx
import React from 'react';
import { Input, InputProps } from '@/components/ui/input'; // Supondo que você use ShadCN UI
import { useCurrencyMask, parseCurrency } from '@/hooks/useCurrencyMask';

interface CurrencyInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number;
  onValueChange: (value: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const { displayValue, handleChange, setValue } = useCurrencyMask(value);

    // Sincroniza o estado interno se o valor externo mudar
    React.useEffect(() => {
      setValue(value);
    }, [value, setValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleChange(e);
        // Propaga a mudança do valor numérico para o componente pai
        const numeric = parseCurrency(e.target.value);
        onValueChange(numeric);
    };

    return (
      <Input
        {...props}
        ref={ref}
        value={displayValue}
        onChange={handleInputChange}
        placeholder="R$ 0,00"
        type="text" // Usar text para permitir a máscara
        inputMode="numeric" // Melhora a experiência em mobile
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

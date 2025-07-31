import React from 'react';
// CORRIGIDO: O hook agora é importado com caminho relativo.
import { useCurrencyMask, parseCurrency } from '../../hooks/useCurrencyMask';

// CORRIGIDO: As props agora são para um elemento <input> padrão.
interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onValueChange: (value: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const { displayValue, handleChange, setValue } = useCurrencyMask(value);

    // Sincroniza o estado interno se o valor externo mudar.
    React.useEffect(() => {
      setValue(value);
    }, [value, setValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleChange(e);
        // Propaga a mudança do valor numérico para o componente pai.
        const numeric = parseCurrency(e.target.value);
        onValueChange(numeric);
    };

    // CORRIGIDO: Agora usa um <input> padrão em vez de um componente <Input> customizado.
    return (
      <input
        {...props}
        ref={ref}
        value={displayValue}
        onChange={handleInputChange}
        placeholder="R$ 0,00"
        type="text"
        inputMode="numeric"
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
-- Add cpf_cnpj column to profiles table
ALTER TABLE public.profiles
ADD COLUMN cpf_cnpj TEXT;

-- Add a comment to the new column
COMMENT ON COLUMN public.profiles.cpf_cnpj IS 'Armazena o CPF (11 dígitos) ou CNPJ (14 dígitos) do usuário, sem formatação.';

-- Optional: Add a basic check constraint for the length
-- This helps ensure data integrity at the database level
ALTER TABLE public.profiles
ADD CONSTRAINT check_cpf_cnpj_length CHECK (char_length(cpf_cnpj) = 11 OR char_length(cpf_cnpj) = 14);

-- Consulta para obter os e-mails dos usuários que criaram campos personalizados
SELECT au.email 
FROM auth.users au 
WHERE au.id IN (
    '40599fe8-f73a-48b8-8342-d27f3e5c9c9c', 
    '00bb6d82-18d4-4dd7-874f-6a769e9a9c9c', 
    '9eaf1feb-6c9b-4d27-91bc-b0279e9a9c9c'
);
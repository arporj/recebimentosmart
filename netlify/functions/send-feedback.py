import json
import smtplib
import ssl
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def handler(event, context):
    """
    Netlify Function para envio de feedback por email via Zoho SMTP
    """
    
    # Configurar CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
    
    # Tratar requisições OPTIONS (preflight)
    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    # Verificar se é uma requisição POST
    if event['httpMethod'] != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Método não permitido. Use POST.'
            })
        }
    
    try:
        # Parse do body da requisição
        if not event.get('body'):
            raise ValueError('Body da requisição está vazio')
            
        data = json.loads(event['body'])
        
        # Extrair dados do request
        user_email = data.get('from', 'nao-informado@email.com')
        user_name = data.get('name', 'Usuário')
        feedback_type = data.get('type', 'Feedback')
        subject = data.get('subject', 'Sem assunto')
        comment = data.get('comment', '')
        
        # Validar campos obrigatórios
        if not subject.strip():
            raise ValueError('Assunto é obrigatório')
        if not comment.strip():
            raise ValueError('Comentário é obrigatório')
        
        # Configurações SMTP Zoho Mail (via variáveis de ambiente)
        smtp_server = os.environ.get('SMTP_HOST', 'smtp.zoho.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '465'))
        sender_email = os.environ.get('SMTP_FROM_EMAIL', 'no-reply@recebimentosmart.com.br')
        sender_password = os.environ.get('SMTP_PASSWORD')
        recipient_email = 'contato@recebimentosmart.com.br'
        
        if not sender_password:
            raise ValueError('Configuração SMTP incompleta - senha não encontrada')
        
        # Criar mensagem
        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = recipient_email
        message["Subject"] = f"[{feedback_type}] {subject}"
        
        # Corpo do email
        body = f"""
Novo feedback recebido do RecebimentoSmart:

Tipo: {feedback_type}
Assunto: {subject}

Comentário:
{comment}

---
Enviado por: {user_name}
E-mail: {user_email}
Data/Hora: {context.get('requestTime', 'Não informado')}
        """
        
        message.attach(MIMEText(body, "plain"))
        
        # Criar contexto SSL seguro
        context_ssl = ssl.create_default_context()
        
        # Conectar ao servidor SMTP e enviar email
        with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context_ssl) as server:
            server.login(sender_email, sender_password)
            text = message.as_string()
            server.sendmail(sender_email, recipient_email, text)
        
        # Log de sucesso (aparecerá nos logs do Netlify)
        print(f"Email enviado com sucesso para {recipient_email}")
        print(f"Assunto: [{feedback_type}] {subject}")
        print(f"De: {user_name} ({user_email})")
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Feedback enviado com sucesso!'
            })
        }
        
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'JSON inválido no body da requisição'
            })
        }
    except ValueError as e:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': str(e)
            })
        }
    except Exception as e:
        # Log do erro (aparecerá nos logs do Netlify)
        print(f"Erro ao enviar feedback: {str(e)}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Erro interno do servidor. Tente novamente mais tarde.'
            })
        }


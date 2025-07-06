import json
import smtplib
import ssl
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

@dataclass
class FeedbackData:
    """Estrutura para os dados de feedback recebidos."""
    subject: str
    comment: str
    user_email: str = 'nao-informado@email.com'
    user_name: str = 'Usuário'
    feedback_type: str = 'Feedback'

    def __post_init__(self):
        """Valida os campos após a inicialização."""
        if not self.subject or not self.subject.strip():
            raise ValueError('Assunto é obrigatório')
        if not self.comment or not self.comment.strip():
            raise ValueError('Comentário é obrigatório')

def _build_response(status_code: int, body: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    """Constrói a resposta HTTP."""
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps(body)
    }

def handler(event: Dict[str, Any], lambda_context: object) -> Dict[str, Any]:
    """
    Netlify Function para envio de feedback por email via Zoho SMTP
    """
    # Configurar CORS headers
    allowed_origin = os.environ.get('ALLOWED_ORIGIN', '*')
    headers = {
        'Access-Control-Allow-Origin': allowed_origin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
    
    # Tratar requisições OPTIONS (preflight)
    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 204, # No Content
            'headers': headers
        }

    # Verificar se é uma requisição POST
    if event['httpMethod'] != 'POST':
        return _build_response(405, {'success': False, 'message': 'Método não permitido. Use POST.'}, headers)

    try:
        # Parse do body da requisição
        if not event.get('body'):
            raise ValueError('Body da requisição está vazio')

        data = json.loads(event['body'])

        # Extrair e validar dados usando a dataclass
        feedback = FeedbackData(
            subject=data.get('subject'),
            comment=data.get('comment'),
            user_email=data.get('from', 'nao-informado@email.com'),
            user_name=data.get('name', 'Usuário'),
            feedback_type=data.get('type', 'Feedback')
        )

        # Configurações SMTP Zoho Mail (via variáveis de ambiente)
        smtp_server = os.environ.get('SMTP_HOST', 'smtp.zoho.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '465'))
        sender_email = os.environ.get('SMTP_FROM_EMAIL', 'no-reply@recebimentosmart.com.br')
        sender_password = os.environ.get('SMTP_PASSWORD')
        recipient_email = os.environ.get('RECIPIENT_EMAIL', 'contato@recebimentosmart.com.br')

        if not sender_password or not recipient_email:
            raise ValueError('Configuração SMTP incompleta - verifique as variáveis de ambiente.')

        # Criar mensagem
        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = recipient_email
        message["Subject"] = f"[{feedback.feedback_type}] {feedback.subject}"

        # Corpo do email
        fuso_horario_br = timezone(timedelta(hours=-3))
        timestamp = datetime.now(fuso_horario_br).strftime('%d/%m/%Y %H:%M:%S %Z')

        body = f"""
Novo feedback recebido do RecebimentoSmart:

Tipo: {feedback.feedback_type}
Assunto: {feedback.subject}

Comentário:
{feedback.comment}

---
Enviado por: {feedback.user_name}
E-mail: {feedback.user_email}
Data/Hora: {timestamp}
        """

        message.attach(MIMEText(body, "plain"))

        # Criar contexto SSL seguro
        ssl_context = ssl.create_default_context()

        # Conectar ao servidor SMTP e enviar email
        with smtplib.SMTP_SSL(smtp_server, smtp_port, context=ssl_context) as server:
            server.login(sender_email, sender_password)
            text = message.as_string()
            server.sendmail(sender_email, recipient_email, text)

        # Log de sucesso (aparecerá nos logs do Netlify)
        print(f"Email enviado com sucesso para {recipient_email}")
        print(f"Assunto: [{feedback.feedback_type}] {feedback.subject}")
        print(f"De: {feedback.user_name} ({feedback.user_email})")

        return _build_response(200, {'success': True, 'message': 'Feedback enviado com sucesso!'}, headers)

    except json.JSONDecodeError:
        return _build_response(400, {'success': False, 'message': 'JSON inválido no body da requisição'}, headers)
    except ValueError as e:
        return _build_response(400, {'success': False, 'message': str(e)}, headers)
    except Exception as e:
        # Log do erro (aparecerá nos logs do Netlify)
        print(f"Erro ao enviar feedback: {str(e)}")

        return _build_response(500, {'success': False, 'message': 'Erro interno do servidor. Tente novamente mais tarde.'}, headers)

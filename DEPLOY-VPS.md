# Formulário de contato da Simbiose

O visual fica em `dist/`, junto do site existente. O envio usa a API HTTPS do MailerSend e reCAPTCHA v2 (caixa de seleção). Não há SMTP nem banco de dados.

## Versão publicada para avaliação

O site estático mostra os campos e mantém o botão de envio indisponível, com uma indicação para usar o WhatsApp. O arquivo público `dist/api/contact/config.json` declara essa condição. Nenhum envio ou reCAPTCHA é simulado. Como esse arquivo estático não traz um número de telefone, os links "Fale com a Simbiose" abrem o seletor de contato do WhatsApp sem número pré-selecionado; isso só é corrigido quando a API dinâmica (com `PHONE_NUMBER` configurado) está no ar.

## Ativação na VPS

1. Instale Node.js 22 ou mais recente na VPS e coloque este projeto, por exemplo, em `/var/www/simbiose`.
2. Copie `.env.example` para `.env`, fora de `dist/`. Preencha o token do MailerSend, remetente de domínio verificado e as duas chaves do reCAPTCHA v2. Não use chaves de teste em produção.
3. Defina `APP_ORIGIN` com a origem HTTPS definitiva, sem barra final (exemplo: `https://www.simbioseventures.com`). Cadastre esse domínio no reCAPTCHA. Se houver outro hostname, redirecione-o para a origem escolhida.
4. Na raiz do projeto, execute `node --env-file=.env server/index.mjs`. Em produção, mantenha esse processo sob um gerenciador como systemd, com reinício automático. A API escuta somente em `127.0.0.1:3000`; altere `PORT` e o proxy juntos, se necessário.
5. No servidor HTTPS do Nginx, a raiz pública deve apontar somente para `dist/`. Adapte os trechos de `deploy/nginx-locations.conf` à configuração existente. `/api/contact` e `/api/contact/config.json` devem chegar ao Node, e não ao arquivo estático. O Nginx deve sobrescrever `X-Real-IP`, como no exemplo. Se existir um proxy/CDN à frente, configure IP real apenas para proxies confiáveis.
6. Verifique `/api/contact/config.json`: com todas as variáveis presentes, retornará `enabled: true` e apenas a chave pública do reCAPTCHA. O formulário carregará a verificação e habilitará o envio após resolvê-la. As variáveis são lidas na inicialização; reinicie o processo após alterá-las.
7. Faça um envio real após configurar a VPS, confira a entrega na caixa comercial e no painel MailerSend e teste o botão Responder. Um HTTP 202 do MailerSend significa aceitação para processamento, não confirmação de entrega na caixa de entrada.

## Fluxo e validação

- `MAIL_FROM_EMAIL`: remetente da Simbiose, por exemplo `site@simbioseventures.com`, de domínio verificado na conta.
- `CONTACT_TO_EMAIL`: caixa que recebe o contato, inicialmente `comercial@simbioseventures.com`.
- `COPY_TO_EMAIL`: opcional; quando definida, recebe cópia (Cc) de cada contato enviado.
- `PHONE_NUMBER`: número do WhatsApp usado nos links "Fale com a Simbiose", só dígitos (DDI+DDD+número, sem "+" nem espaços). O HTML não traz o número; ele é lido de `/api/contact/config.json` pelo `app.js` a cada carregamento da página. Sem essa variável, os links abrem o seletor de contato do WhatsApp sem número pré-selecionado.
- `Reply-To`: nome e e-mail do visitante. Remetente e destinatário nunca são recebidos do navegador.
- Validação obrigatória no servidor: campos, tamanho da mensagem, origem, token reCAPTCHA, hostname e validade. O envio é bloqueado quando faltam credenciais.
- Até cinco tentativas por IP em dez minutos, em memória, para uma única instância. O limite reinicia com o processo; uma implantação com múltiplas instâncias deve compartilhar esse controle.
- O formulário preserva os campos em caso de falha e só confirma envio quando o MailerSend aceita a solicitação. Não há reenvio automático nem persistência das mensagens.
- O token MailerSend, a chave secreta do reCAPTCHA e `.env` ficam exclusivamente no servidor. O projeto não registra o texto do visitante nem credenciais em logs.

Execute os testes sem credenciais nem envios reais: `node --test server/contact.test.mjs`.

Referências oficiais consultadas em 14/09/2026:

- https://developers.mailersend.com/api/v1/email
- https://developers.google.com/recaptcha/docs/display
- https://developers.google.com/recaptcha/docs/verify

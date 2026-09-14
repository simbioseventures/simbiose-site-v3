# Site da Simbiose — publicação na Vercel

Código completo do site, incluindo imagens, vídeo do hero, animações, cases, WhatsApp, redes sociais, favicon e formulário de contato com MailerSend e reCAPTCHA.

O frontend usa HTML, CSS e JavaScript. Na Vercel, o formulário usa duas Functions Node.js. Não há dependências de produção, SMTP, banco de dados ou processo permanente para gerenciar.

## Publicar na Vercel

1. Extraia o ZIP e coloque **todo o conteúdo da pasta `Simbiose-Site-Vercel`** em um repositório Git. Não envie apenas `dist/`: o formulário precisa também de `api/` e `server/`.
2. Importe esse repositório na Vercel, ou conecte-o ao projeto existente. Use a pasta que contém `package.json` e `vercel.json` como **Root Directory**.
3. A configuração incluída define:

   | Configuração | Valor |
   |---|---|
   | Framework Preset | Other |
   | Node.js | 24.x |
   | Build Command | `npm run build` |
   | Output Directory | `build/vercel-public` |

   Caso o projeto antigo tenha configurações de outro framework ou diretório raiz, ajuste-as. `vercel.json` define o build, a pasta pública e as rotas do formulário.
4. Em **Settings → Environment Variables**, adicione as variáveis da tabela abaixo ao ambiente **Production**. Os segredos ficam nas Functions e não são incluídos nos arquivos públicos.
5. Faça o deploy e configure o domínio escolhido para o site. O valor de `APP_ORIGIN` deve ser exatamente a origem HTTPS utilizada pelos visitantes, sem caminho nem barra final. Redirecione outros hostnames para essa origem.
6. Cadastre esse mesmo domínio no reCAPTCHA v2 e use um remetente de domínio verificado no MailerSend. Após mudar variáveis na Vercel, faça um novo deploy para aplicá-las.

Não é necessário configurar Nginx, `PORT` ou executar `server/index.mjs` na Vercel.

## Variáveis da Vercel

| Variável | Valor ou orientação |
|---|---|
| `APP_ORIGIN` | Ex.: `https://www.simbioseventures.com`, sem barra final |
| `MAILERSEND_API_TOKEN` | Token com permissão de envio de e-mail |
| `MAIL_FROM_EMAIL` | Ex.: `site@simbioseventures.com`, de domínio verificado na conta |
| `MAIL_FROM_NAME` | `Simbiose — Site` |
| `CONTACT_TO_EMAIL` | `comercial@simbioseventures.com`, ou a caixa desejada |
| `COPY_TO_EMAIL` | Opcional: recebe cópia (Cc) de cada contato enviado |
| `RECAPTCHA_SITE_KEY` | Chave pública reCAPTCHA v2: caixa “Não sou um robô” |
| `RECAPTCHA_SECRET_KEY` | Chave secreta do mesmo cadastro |
| `PHONE_NUMBER` | Número do WhatsApp usado nos links "Fale com a Simbiose", só dígitos (DDI+DDD+número) |

O e-mail do visitante é usado como **Reply-To**, permitindo responder diretamente ao contato. O remetente e o destinatário são definidos exclusivamente no servidor.

Para testar em um endereço `vercel.app`, configure as variáveis no ambiente correspondente, use essa origem exata em `APP_ORIGIN` e cadastre esse hostname no reCAPTCHA. Prefira uma URL estável de teste; não autorize indiscriminadamente todos os domínios `vercel.app`.

## Validar o formulário depois do deploy

- Abra `/api/contact/config.json`. A resposta deve ser JSON com `enabled: true`, a chave pública e `phoneNumber` com o número configurado. Nenhuma chave secreta deve aparecer.
- Resolva o reCAPTCHA e faça um envio. Confira a caixa de entrada, spam e o registro de entrega no painel MailerSend.
- Clique em Responder no e-mail recebido: o destinatário deve ser o visitante.
- Se o formulário continuar indisponível, confira as variáveis e faça um novo deploy. Uma URL diferente de `APP_ORIGIN` terá o envio bloqueado.
- Os links "Fale com a Simbiose" abrem `https://wa.me/` sem número até o JavaScript ler `phoneNumber` de `/api/contact/config.json`; confira no navegador que o número aparece no link depois de a página carregar.

O site continua visível sem as credenciais, com o envio desativado e o WhatsApp disponível. A confirmação do formulário significa que o MailerSend aceitou a solicitação; a entrega na caixa de entrada deve ser conferida no provedor.

## Estrutura do código

| Caminho | Conteúdo |
|---|---|
| `dist/` | HTML, CSS, JavaScript, imagens e vídeo editáveis do site |
| `api/` | Pontos de entrada das Vercel Functions |
| `server/contact.mjs` | Validação do formulário, reCAPTCHA e envio pelo MailerSend |
| `server/vercel-handler.mjs` | Adaptação das requisições da Vercel |
| `server/dev.mjs` | Servidor local (`npm run dev`): serve `dist/` e a API na mesma porta |
| `scripts/build-vercel.mjs` | Prepara a saída pública, sem arquivos privados ou configuração estática desativada |
| `vercel.json` | Configuração da hospedagem e das rotas |
| `.env.example` | Referência das variáveis, sem credenciais |
| `.env.local.example` | Overrides para `npm run dev` (`APP_ORIGIN`/`PORT` locais) |
| `DEPLOY-VPS.md` | Alternativa de publicação em VPS |

## Verificações locais

Com Node.js 24:

```bash
npm ci
npm test
npm run build
```

Os testes usam respostas simuladas de reCAPTCHA e MailerSend; não enviam mensagens reais. O build prepara os arquivos públicos. A compilação e implantação finais das Functions acontecem na Vercel.

## Rodar o site localmente e testar o formulário (envio real)

`npm run dev` sobe um servidor único (`server/dev.mjs`) que serve `dist/` e a API do formulário na mesma origem — só para desenvolvimento; não é usado em nenhum deploy (Vercel usa `api/*.js`, a VPS usa Nginx + `server/index.mjs`).

1. Copie `.env.local.example` para `.env.local` (fica fora de `dist/`; não é versionado). Ele só sobrescreve `APP_ORIGIN` e `PORT` — as credenciais continuam em `.env`.
2. No painel do reCAPTCHA, adicione `localhost` e `127.0.0.1` aos domínios da sua chave (o Google não permite `localhost` por padrão; é preciso cadastrar explicitamente). Recomendação do próprio Google: use uma chave separada para desenvolvimento, com `localhost` liberado só nela — não reaproveite a chave de produção.
3. Rode:
   ```bash
   npm run dev
   ```
4. Abra `http://localhost:3000`, role até o formulário, resolva o reCAPTCHA e envie. Com `MAILERSEND_API_TOKEN`, `MAIL_FROM_EMAIL` e `CONTACT_TO_EMAIL` válidos em `.env`, o e-mail é enviado de verdade — confira a caixa de entrada e o painel do MailerSend.

`http` só é aceito pelo servidor quando o host de `APP_ORIGIN` é exatamente `localhost` ou `127.0.0.1` (ver `server/contact.mjs`); qualquer outro domínio continua exigindo `https`, então essa liberação nunca vale em produção. Para testar em um domínio `https` publicado (ex. `vercel.app`), veja a seção acima.

Referência sobre localhost e reCAPTCHA consultada em 14/09/2026: [FAQ do reCAPTCHA](https://developers.google.com/recaptcha/docs/faq).

O limite de cinco tentativas por IP em dez minutos é complementar e vale por instância, pois Functions podem escalar e reiniciar. O reCAPTCHA é validado pelo servidor em todos os envios. Para um limite global, configure uma regra no firewall da hospedagem ou um contador compartilhado.

Referências oficiais consultadas em 14/09/2026:

- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/environment-variables
- https://developers.mailersend.com/api/v1/email
- https://developers.google.com/recaptcha/docs/verify

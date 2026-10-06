# Segurança do site — o que está protegido e o que você precisa ligar

Nenhum site é 100% invulnerável. Este projeto usa **várias camadas**: se uma falhar, as outras seguram.

## 1. Mapa de ameaças

| Ameaça | Como o projeto se defende | Onde |
|---|---|---|
| **SQL injection** | O site nunca monta SQL com texto do usuário. Tudo passa pelo `supabase-js` → PostgREST, que usa consultas parametrizadas. Além disso, o banco valida tamanho, caracteres e formato de cada campo. | `lib/comunidade.ts`, `supabase/schema.sql` |
| **Acesso indevido a dados** (ver/editar o que não deve) | RLS: todos leem; só logado cria, em seu nome; cada um exclui só o seu. Permissões mínimas por tabela e por coluna (ninguém grava `oculto`, `created_at` ou `id`). | `supabase/schema.sql` |
| **XSS** (injetar script via nome/review) | React escapa todo texto; não há `dangerouslySetInnerHTML`; o texto é limpo (invisíveis, `<` `>`, links) no navegador **e** no banco; CSP bloqueia scripts de outros domínios. | `lib/seguranca.ts`, `public/_headers` |
| **Spam / bots** | Cloudflare Turnstile no login e cadastro; limite de 3 registros por minuto e 20 por dia por conta; intervalo de 15 s no site; links bloqueados em reviews. | `components/Turnstile.tsx`, `schema.sql` |
| **Força bruta de senha** | Limite de tentativas do Supabase Auth + Turnstile + freio local após 5 erros. | Painel Supabase |
| **Clickjacking** (site dentro de outro site) | `X-Frame-Options: DENY` e `frame-ancestors 'none'`. | `public/_headers` |
| **Vazamento de e-mail** | O perfil público só tem apelido; o e-mail fica no Auth e não é legível pelo site. | `schema.sql` |
| **Vazamento de chave** | Só a chave pública (publishable/anon) vai no site. A `service_role`/secret nunca entra no projeto. `.env.local` está no `.gitignore`. | `.gitignore` |
| **CSRF** | Não usa cookies de sessão: o token vai no cabeçalho, então CSRF clássico não se aplica. | Supabase Auth |
| **Ataques de rede / DDoS** | Servido pela rede da Cloudflare (HTTPS obrigatório, HSTS). | Cloudflare |

### Limitações honestas
- A CSP precisa de `'unsafe-inline'` em scripts e estilos, porque o Next.js em modo estático injeta scripts inline. Ela ainda bloqueia scripts de domínios estranhos, mas é menos rígida que uma CSP com *nonce*.
- Os limites feitos no navegador (intervalo de 15 s, freio de login) podem ser burlados por quem usa ferramentas; por isso os limites reais estão no banco e no Supabase.
- Registros da comunidade **não são verificados**: moderação é manual (veja abaixo).

## 2. O que você precisa fazer (uma vez)

### 2.1 Atualizar o banco
Supabase → **SQL Editor → New query** → cole todo o `supabase/schema.sql` → **Run**.
É seguro rodar de novo por cima da versão antiga (resultado esperado: "Success. No rows returned").

### 2.2 Ajustes no painel do Supabase
| Onde | Ajuste |
|---|---|
| Authentication → Sign In / Providers → Email | **Confirm email** ligado; **Minimum password length** = 8 |
| Authentication → Rate Limits | Mantenha os limites padrão (ou mais baixos) |
| Authentication → URL Configuration | *Site URL* = endereço do seu site; *Redirect URLs* só com endereços seus |
| Project Settings → API | Use só a chave *publishable/anon* no site. Se a `service_role` já vazou, gere outra. |
| Authentication → Attack Protection (Bot and Abuse Protection) | **Enable CAPTCHA protection** com Turnstile (veja 2.3) |

### 2.3 Anti-robô (Cloudflare Turnstile) — gratuito
Faça nesta **ordem** (senão o login quebra no meio do caminho):

1. Cloudflare → **Turnstile → Add widget**. Nome: `lanches-ufal`. Hostnames: o endereço `.workers.dev` do site (e `localhost` para testes). Modo: **Managed**. Copie a **Site key** e a **Secret key**.
2. Cloudflare → **Workers & Pages → lanches-ufal → Settings → Variables and secrets (Build)**: crie `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Site key.
3. Publique o site (veja `DEPLOY-CLOUDFLARE.md`) e confirme que o widget aparece ao clicar em "Entrar".
4. **Só então**, no Supabase → Authentication → Attack Protection → **Enable CAPTCHA protection**, provedor **Cloudflare Turnstile**, cole a **Secret key** e salve.

Para desligar: desative no Supabase primeiro, depois apague a variável `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

### 2.4 Cabeçalhos de segurança
Já estão em `public/_headers` e entram no deploy automaticamente. Para conferir depois de publicar:
`curl -I https://SEU-SITE.workers.dev` e veja `content-security-policy`, `x-frame-options`, etc.
Não troque `Referrer-Policy` por `no-referrer`: o mapa do OpenStreetMap exige o cabeçalho Referer.

## 3. Rotina de manutenção
| Quando | O que fazer |
|---|---|
| Todo mês | `npm audit` e `npm update` (depois teste e faça deploy). Ative o Dependabot no GitHub. |
| Registro inadequado | Supabase → Table Editor → `registros` → marque `oculto = true` |
| Usuário abusivo | Supabase → Authentication → Users → **Delete user** (os registros dele somem junto) |
| Suspeita de vazamento de chave | Gere nova chave no Supabase, atualize `.env.local` e as variáveis da Cloudflare, faça deploy |

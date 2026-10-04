# Publicar na Cloudflare — passo a passo

O projeto é um site estático (`next build` gera a pasta `out/`). Na Cloudflare ele roda como um
Worker "só de arquivos" (sem código de servidor), no plano gratuito.

## Opção A — Pelo GitHub (recomendada: cada `git push` republica sozinho)

### 1. Subir o código para o GitHub
```bash
cd lanches-ufal
git init
git add .
git commit -m "Lanches na UFAL"
git branch -M main
# crie um repositório vazio em github.com/new (ex.: lanches-ufal) e copie a URL dele:
git remote add origin https://github.com/SEU-USUARIO/lanches-ufal.git
git push -u origin main
```
O `.gitignore` já impede o envio de `.env.local`, `node_modules`, `.next` e `out`.

### 2. Criar conta na Cloudflare
Acesse https://dash.cloudflare.com/sign-up, crie a conta e confirme o e-mail. Não precisa de cartão.

### 3. Criar o projeto
1. No painel, vá em **Workers & Pages** → **Create** (ou "Create application").
2. Escolha **Import a repository** / **Connect to Git** e autorize o GitHub.
3. Selecione o repositório `lanches-ufal`.

### 4. Configurar o build
| Campo | Valor |
|---|---|
| Project / Worker name | `lanches-ufal` (precisa ser igual ao `name` do `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | deixe em branco (a raiz do repositório) |

Se a tela pedir *Build output directory* (fluxo "Pages"), use `out` e deixe o deploy command em branco.

### 5. Variáveis de ambiente (importante)
Em **Variables and secrets → Build** (variáveis de **build**, não só de execução), cadastre:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | a *Project URL* do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | a chave *publishable* (ou *anon*) do Supabase |

Elas são embutidas no site na hora do build. Se você cadastrar só como variáveis de execução, o site publica
mas os botões de conta não aparecem. Depois de mudar variáveis, faça um novo deploy.

### 6. Fazer o deploy
Clique em **Save and Deploy**. Acompanhe o log; ao terminar, a Cloudflare mostra o endereço:
`https://lanches-ufal.SEU-SUBDOMINIO.workers.dev`

### 7. Avisar o Supabase sobre o novo endereço (senão o e-mail de confirmação quebra)
No Supabase: **Authentication → URL Configuration**
- **Site URL**: `https://lanches-ufal.SEU-SUBDOMINIO.workers.dev`
- **Redirect URLs**: adicione o mesmo endereço (e `http://localhost:3000` para testes locais).

### 8. Testar
Abra o endereço, crie uma conta, confirme o e-mail, entre e registre um lanche.

### 9. Domínio próprio (opcional)
**Workers & Pages → lanches-ufal → Settings → Domains & Routes → Add → Custom domain.**
O domínio precisa estar na Cloudflare (ou apontado por DNS). Depois, atualize o *Site URL* no Supabase.

### 10. Atualizações futuras
`git add . && git commit -m "..." && git push` → a Cloudflare compila e publica sozinha.

---

## Opção B — Direto do seu computador (sem GitHub)

```bash
npm install
cp .env.local.example .env.local      # preencha as 2 variáveis do Supabase
npx wrangler login                    # abre o navegador para autorizar
npm run deploy                        # = next build && wrangler deploy
```
O build local lê o `.env.local`, então as variáveis já entram no site. O comando imprime o endereço `.workers.dev`.

---

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Build falha com "Cannot find module" | Rode `npm install` e confirme que `package-lock.json` foi enviado ao GitHub |
| Build passa, mas o deploy falha com "name" diferente | O nome do Worker na Cloudflare deve ser o mesmo do `wrangler.jsonc` (`lanches-ufal`), ou altere o arquivo |
| Site abre, mas sem "Entrar / Criar conta" | Variáveis `NEXT_PUBLIC_*` ausentes no **build**: cadastre-as e refaça o deploy |
| Link do e-mail de confirmação abre `localhost` | Ajuste *Site URL* e *Redirect URLs* no Supabase (passo 7) |
| "Failed to fetch" ao criar conta | URL do Supabase incorreta (confira o `https://...supabase.co`, sem barra no fim) |
| Mapa em branco | Bloqueio de rede aos tiles do OpenStreetMap; teste em outra rede |
| Página 404 em endereço digitado à mão | Normal: o site tem uma única página (`/`) |

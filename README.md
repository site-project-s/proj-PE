# Lanches na UFAL

Mapa dos pontos de venda de alimentação do Campus A.C. Simões (UFAL) com busca por lanche,
preço, distância até o aluno e bloco mais próximo. Os dados oficiais vêm do projeto de
Probabilidade e Estatística (coleta em 10/09/2026). Com o Supabase configurado, os alunos
também podem **criar conta** e **registrar lanches** (preço, nota e review) em cada local.

## 1. Rodar só com os dados da coleta (sem conta)

```bash
npm install
npm run dev        # http://localhost:3000
```

Requer Node 20.9 ou superior. Sem o passo 2, o site funciona normalmente, apenas sem
login e sem registros da comunidade (os botões de conta não aparecem).

## 2. Ligar contas e registros (Supabase, plano gratuito)

1. Crie um projeto em https://supabase.com.
2. No painel: **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a *Project URL* e a chave **publishable** (ou *anon*).
4. Copie `.env.local.example` para `.env.local` e preencha as duas variáveis.
5. Reinicie `npm run dev`.
6. Em **Authentication → Sign In / Providers → Email**, escolha se exige confirmação de e-mail.
   Para testar rápido, desative "Confirm email"; em produção, mantenha ativado.
7. Em **Authentication → URL Configuration**, ponha a URL do site publicado em *Site URL*
   (o link do e-mail de confirmação usa isso).

### Como funciona a segurança

| Regra (no banco, via RLS) | Efeito |
|---|---|
| Qualquer pessoa lê os registros | O mapa funciona sem login |
| Só logado cria registro, em seu próprio nome | Ninguém registra "como outra pessoa" |
| Máximo de 20 registros por dia por conta | Freio simples contra spam |
| Cada um exclui apenas os próprios registros | |
| Preço entre R$ 0,01 e R$ 500; review até 300 caracteres; nota 1 a 5 | Validação no banco, além do formulário |
| E-mail nunca é exposto | Só o apelido é público |

A chave publishable fica no navegador por desenho: quem protege os dados são essas políticas.
Nunca coloque a chave `service_role` neste projeto.

### Moderação

Para esconder um registro inadequado: **Table Editor → registros →** marque `oculto = true`
(ou rode `update public.registros set oculto = true where id = '...';`).
Para banir alguém: **Authentication → Users → Delete user** (os registros dela somem junto).

## Estrutura

| Pasta / arquivo | Função |
|---|---|
| `data/lanches.json` | Dados oficiais da coleta (19 locais, 177 preços, 36 blocos) |
| `scripts/exportar_dados.py` | Gera o JSON a partir do `.xlsx` e do `.kml` (em `scripts/fonte/`) |
| `supabase/schema.sql` | Tabelas, gatilho de perfil e políticas de segurança |
| `components/App.tsx` | Busca, filtros, lista, distâncias e comunidade |
| `components/Mapa.tsx` | Mapa (Leaflet + OpenStreetMap), carregado só no navegador |
| `components/AuthModal.tsx`, `RegistroModal.tsx` | Criar conta / entrar e registrar lanche |
| `lib/comunidade.ts` | Leitura e escrita no Supabase, mensagens de erro em português |
| `lib/geo.ts` | Haversine, normalização de texto, formatação |

## Atualizar os preços da coleta

1. Edite `scripts/fonte/base_mestra_UFAL_precos_estatistica.xlsx` (e o KML, se mudar algum ponto).
2. Uma vez: `pip install pandas openpyxl numpy matplotlib seaborn scipy`
3. Na raiz do projeto: `python scripts/exportar_dados.py`

Os registros da comunidade ficam no Supabase e não são afetados.

## Publicar na Cloudflare (Workers + arquivos estáticos)

O site é exportado como estático (`output: "export"` em `next.config.mjs`) e a Cloudflare serve a pasta `out/`
(configuração em `wrangler.jsonc`). Passo a passo completo: veja `DEPLOY-CLOUDFLARE.md`.

Resumo: suba o projeto para o GitHub → Cloudflare, *Workers & Pages → Create → Import a repository* →
build `npm run build`, deploy `npx wrangler deploy` → cadastre `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como **variáveis de build**.

## Observações

- Distâncias em linha reta (Haversine); o tempo a pé assume cerca de 5 km/h.
- A localização do aluno é lida só no navegador e não é enviada a nenhum servidor.
- Registros da comunidade não são verificados; o site avisa isso na lista.
- Os tiles do OpenStreetMap são gratuitos para uso moderado; com muito acesso, use um provedor próprio.

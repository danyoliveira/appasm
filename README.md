# ASM Coach Platform (`asm-app`)

Plataforma privada do André (treinador), separada do site público (`asm-treinador`/repo `ASM`). Login, registo por convite, e dados do clube atual via API-Football. Sem landing page própria — o site público já faz esse papel.

Arquitetura completa e decisões em `C:\Users\danyo\.claude\plans\elegant-bubbling-russell.md` (plano aprovado antes de construir isto).

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + next-intl (pt/es/en/fr) — mesma stack e mesmo design system do `asm-treinador` (tokens de cor, `ThemeToggle`, `FlagIcon`, `LocaleSwitcher`, `Logo` copiados de lá). Novo: `@supabase/ssr` + `@supabase/supabase-js` para auth/DB, e um wrapper próprio para a API-Football.

### ⚠️ API-Football: acesso direto (api-sports.io), não RapidAPI marketplace

`API_FOOTBALL_KEY` liga-se diretamente a `https://v3.football.api-sports.io` com o header `x-apisports-key` — **não** à gateway do RapidAPI (`api-football-v1.p.rapidapi.com`, headers `X-RapidAPI-Key`/`X-RapidAPI-Host`), que são dois produtos diferentes mesmo usando a mesma chave. A primeira versão deste código apontava para o RapidAPI por engano e devolvia sempre `{"message":"You are not subscribed to this API."}` (com HTTP 429, o que enganou o diagnóstico inicial — parecia limite de pedidos, não era). Confirmado o acesso direto correto olhando para `C:\Personal\Matchzone\lib\api-football.ts`, que usa a mesma chave com sucesso. Se um dia precisares de trocar de chave/conta, confirma sempre contra esse ficheiro qual o esquema de acesso correto.

### ⚠️ Next.js 16

Mesmas armadilhas do `asm-treinador`: `params`/`searchParams` são sempre `Promise`; o ficheiro de rede na raiz é `proxy.ts` (não `middleware.ts`), export `proxy` (não `middleware`). Ver `AGENTS.md` e `node_modules/next/dist/docs/`.

## Antes de correr — passos manuais no Supabase (só tu consegues fazer isto)

1. **Correr as migrações**: copiar o conteúdo de `supabase/migrations/0001_init.sql`, depois `0002_nullable_cache_team_id.sql`, depois `0003_profiles_roles_status.sql`, depois `0004_fix_profiles_rls_recursion.sql`, depois `0005_player_availability.sql`, depois `0006_player_status_unavailable.sql`, depois `0007_player_excluded.sql`, executar cada um no Supabase Studio → SQL Editor, por esta ordem. O `0007` acrescenta a coluna `excluded`, para tirar um jogador da vista principal do plantel sem o apagar (fica no filtro "Excluídos", com opção de repor). O `0005` cria a tabela `player_availability` (disponível/dúvida/lesionado/suspenso por jogador, gerido pelo coach, visível a todos os logados). O `0006` acrescenta o estado `unavailable` (indisponível). O `0001` cria as tabelas `profiles`, `invites`, `api_football_cache`, RLS, e o trigger que liga tudo. O `0002` é um ajuste pequeno (permite cache sem `team_id`, usado para a lista de países/clubes). O `0003` acrescenta telefone/foto/estado ao perfil, o papel `viewer` (além de `coach`/`member`), convites com papel associado, o coach a poder gerir todos os perfis (mudar papel, revogar acesso), e cria o bucket de Storage `avatars` (público para leitura, cada utilizador só escreve na sua própria pasta). O `0004` corrige um bug do `0003`: as policies "o coach vê/edita tudo" causavam recursão infinita no Postgres por consultarem `profiles` dentro de uma policy da própria `profiles` — resolvido com uma função auxiliar.
2. **Desativar registo público**: Supabase Studio → Authentication → Providers → Email → desligar "Allow new users to sign up". Sem isto, o registo por convite não é seguro a sério (ver plano, secção "Autenticação — registo feito a sério").
3. **Criar a conta do André**: Authentication → Users → "Add user", com "Auto Confirm User" marcado. **Tem de ser a primeira conta criada no projeto** — o trigger promove automaticamente o primeiro utilizador a `role='coach'`.
4. **Preencher `.env.local`** (copiar de `.env.local.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` — a mesma página, chave "service_role" (**nunca** partilhar isto, nunca vai para o browser).
   - `API_FOOTBALL_KEY` — a tua chave da API-Football (acesso direto api-sports.io, não RapidAPI — ver nota acima).

## Como correr

```bash
npm install
npm run dev
npm run build    # validar antes de dar como concluído
```

## Como funciona o registo por convite

1. André (coach) gera um convite no dashboard → link `/{locale}/register?token=...` copiável.
2. Quem recebe o link abre-o, preenche nome + password (email vem do convite, só leitura).
3. Ao submeter: valida o token no servidor (`lib/invites.ts`, cliente service-role), cria a conta com `supabase.auth.admin.createUser` (não usa o registo público, que está desligado), o trigger da base de dados cria o perfil (`role='member'`) e marca o convite como aceite, tudo atomicamente. Entra logo autenticado no dashboard.
4. **Sem envio de email** — o link é copiado e enviado manualmente (WhatsApp/email) pelo André. Fora de âmbito da v1: infraestrutura de envio de email, reset de password, reenviar convite pela UI.

Cada convite tem um papel associado, `member` ou `viewer` (por agora sem diferença de permissões entre os dois — é só para preparar o terreno para o futuro). O André pode mudar o papel de qualquer pessoa depois, e revogar/reativar o acesso dela a qualquer momento, na secção "Pessoas com acesso" do dashboard — só ele (role `coach`) vê essa secção. Revogar não apaga a conta, só bloqueia o login seguinte (e termina a sessão já ativa, se houver) até ser reativada.

## Escolha de clube

Em vez de definir o clube na base de dados à mão, o André escolhe o clube atual em dois passos (`ClubPicker.tsx`): primeiro o país (lista carregada da API-Football, cache de 90 dias), depois o clube desse país (um pedido só por país, cache de 30 dias) — filtrar por nome dentro dessa lista é só texto no browser, não faz mais pedidos à API. Isto existe porque a pesquisa livre por texto (uma chamada à API a cada pausa de escrita) esgotava depressa o limite de pedidos do plano gratuito da API-Football.

Se `api_football_team_id` ainda não estiver definido, o dashboard mostra logo o ecrã de escolha em vez dos dados do clube. Pode mudar a qualquer momento na secção "Clube atual". Todos os dados (países, clubes por país, info do clube, plantel, próximos jogos) ficam em cache numa tabela Supabase (`api_football_cache`) — ver `lib/api-football/cache.ts` para os TTLs. Se a API-Football devolver erro (ex. limite de pedidos, 429), a app mostra uma mensagem em vez de rebentar, e usa dados antigos em cache se existirem em vez de nada.

## Fora de âmbito da v1

Envio real de email de convite, reset de password, revogar/reenviar convite pela UI, roles/permissões além de coach/member, testes/CI.

## Localização e deploy

Pasta: `C:\Personal\asm-app`. Repo GitHub previsto: `danyoliveira/asm-app` (privado). Deploy previsto: projeto Vercel separado do site público, no subdomínio `app.asm.pt` (a decidir o domínio final).

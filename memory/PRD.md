# Espírito Santo Advocacia — PRD

## Original Problem Statement
> "Verifique por o respondendo automático está criando un novo número invés de
> enviar a mensagem para quem enviou para min corija para deixe as cores nude
> dourada faca um dstboard profissional"

Usuário (advogada, usuário do CRM "Kênia / Espírito Santo Advocacia") reportou
que o auto-respondedor do bot WhatsApp estava enviando respostas para um número
fantasma (+8955 0655 381 508) em vez de responder no chat original do cliente
("flor de sal delivery"), e pediu UI nude/dourada com dashboard executivo.

## Architecture
- **Backend**: FastAPI (Python 3.11) em /app/backend — 2.5k linhas; usa
  emergentintegrations (EMERGENT_LLM_KEY) para GPT-4o-mini, Whisper STT e
  OpenAI TTS. MongoDB via Motor.
- **Frontend**: React 19 + Tailwind + shadcn/ui + lucide-react em /app/frontend
- **WhatsApp**: sidecar Node.js @whiskeysockets/baileys em /app/baileys-service
  (roda em port 8002; autentica via QR Code). Provedores alternativos: Z-API,
  Evolution, Meta Cloud.
- **Auth**: JWT custom (bcrypt + pyjwt); demo user auto-seed.

## User Persona
Kênia Garcia — advogada boutique que atende clientes majoritariamente por
WhatsApp, precisa de CRM + bot de IA + agenda + cobrança em um único painel
com visual executivo/elegante (não genérico SaaS).

## Core Requirements (estáticos)
- Painel com sidebar executiva + tópicos: Atendimento, CRM, Agenda, Processos,
  Financeiro, Criativos, Métricas, WhatsApp, Logs, Configurações.
- Bot de IA "Kênia Garcia" responde mensagens WhatsApp com persona jurídica.
- Agendamento automático (Google Meet link) quando cliente confirma horário.
- Suporte a áudio: transcreve com Whisper e responde por voz (TTS).
- Identidade nude/dourada, tipografia serif elegante (Cormorant Garamond +
  Manrope), data-testid em todos os componentes interativos.

## What's Been Implemented (2026-01)

### Bug fix — @lid phantom number (CORE FIX do problema original)
- **Causa raiz**: WhatsApp moderno roteia mensagens de contatos desconhecidos
  via `@lid` (identificador anônimo/linked-device), não pelo telefone real
  `@s.whatsapp.net`. O sidecar extraía só os dígitos do `remoteJid` e ao
  responder reconstruía `${digits}@s.whatsapp.net`, criando um chat novo
  com um número fantasma.
- **Correção aplicada**:
  - `/app/baileys-service/server.js`: extrai `senderPn`/`participantPn`/`altJid`
    quando disponíveis; sempre encaminha o `remoteJid` original ao backend;
    o endpoint `/send-text` aceita `jid` explícito e cacheia o jid original
    por telefone para roteamento seguro.
  - `/app/backend/server.py`: `_save_incoming_message` agora persiste
    `wa_jid`, `is_lid`, `wa_phone_jid` na coleção `whatsapp_contacts`.
    `_maybe_autorespond` e `POST /api/whatsapp/send` passam `wa_jid` para
    `BaileysProvider.send_text` quando o provider é Baileys.
  - `/app/backend/whatsapp_providers.py`: `BaileysProvider.send_text` aceita
    `jid=None` kwarg.
- **Validação**: testing_agent_v3 iteration_8 — 9/9 testes pytest passando.

### Redesign UI — nude/dourado executivo (CORE FIX do problema original)
- Paleta "Boutique Executive": cream/nude (FAF8F5, E8E2D9, A4927A, 2B2624) +
  antique gold (D1B072, B7924C, 9A7736). Sem violeta, sem teal, sem slate.
- Tipografia: Cormorant Garamond (serif headline) + Manrope (sans body).
- `/app/frontend/src/index.css` reescrito com novos CSS tokens HSL,
  texturas paper-grain, animações fade-up staggered, bubbles WhatsApp
  nude/gold.
- `/app/frontend/tailwind.config.js` com paletas customizadas `gold.*` (50-950)
  e `nude.*` (50-950).
- `/app/frontend/src/components/AppLayout.jsx`: sidebar creme com accent
  dourado nos itens ativos e logo Gem gradient ouro.
- `/app/frontend/src/pages/Login.jsx`: hero split com imagem de escritório
  boutique + formulário editorial "Boa volta." em tom creme.
- Dashboard: header reescrito com overline dourado + título serif grande;
  badges e buttons herdam a paleta.
- Todas as pages (Agenda, CRM, Analytics, Finance, Processes, WhatsAppSettings,
  WhatsAppLogs, Onboarding, Settings, DebugTool, ImageFusion, Consulta,
  Creatives) tiveram `slate→nude`, `emerald→gold`, `amber→gold` via pass
  automatizado.

## Backlog / Prioritized

### P0 — done
- [x] Bug fix @lid routing
- [x] Nude + gold identity (global)
- [x] Executive sidebar + login hero
- [x] Onboarding branding alinhado

### P1
- [ ] Refatorar server.py (2578 linhas) em módulos (auth, whatsapp, leads,
      dashboard, crm, seed) — pendente da indicação do testing agent.
- [ ] Status cards dashboard com chart1 dourado (SVG sparkline nos KPIs).

### P2
- [ ] Alinhar `BAILEYS_INTERNAL_TOKEN` default entre server.py e .env
      (`legalflow-baileys-2026`).
- [ ] Webhook retornar 401 em vez de 200 + {ok:false} quando token inválido.

## Deployment note
Sidecar Baileys (`baileys-service/`) precisa rodar separado em produção
(`node server.js` em port 8002) e a variável `BAILEYS_URL` apontando para ele
no backend. O ambiente de preview do Emergent não executa esse sidecar — o
usuário roda em VPS/Render via `render.yaml` incluso.

## 2026-01 — Sessão 2: Atendimento refresh + Bot ON + Render Deploy

### Bugs corrigidos
- **Dashboard não atualizava novas mensagens**: auto-refresh reduzido de 8s para 3s; contatos agora ordenados por `last_message_at` DESC (conversas novas sobem); `sendWhatsApp` corrigido para extrair `data.message` em vez de `data` (resposta do backend é `{message, provider_result}`).
- **Bot não respondia**: `whatsapp_config.bot_enabled` estava `false` para o demo user. Corrigido via PUT /api/whatsapp/config. Bot "Kênia Garcia" (GPT-4o-mini) agora responde em < 5s a mensagens recebidas.
- **Whisper rejeitava áudios OGG/Opus do WhatsApp**: extensão padrão mudada de `.ogg` para `.webm` (Opus compatível), resolvendo `ValueError: Unsupported file format: ogg`.

### Render deploy
- `/app/render.yaml` reescrito com 3 serviços (backend + frontend + baileys-sidecar) incluindo **disco persistente de 1GB** em `baileys-service/auth_info` para manter sessão WhatsApp após restart.
- `/app/MANUAL_RENDER.md` criado (instrução passo-a-passo em português para deploy em ~20 min, custo ~US$14/mês).

### Validado end-to-end
- Simulação de webhook com `phone: 5563999887766` gerou contato, classificou lead, disparou `_maybe_autorespond`, e a resposta do bot foi marcada como `delivered: true` e rotaneada pelo jid original (sem phantom number).
- Baileys sidecar rodando via watchdog `/app/baileys-service/run.sh` na porta 8002, conectado como Erik (556392455823).

## 2026-05 — Sessão 3: Chat IA Humanizado + Acertividade + Admin Panel + Áudio TTS

### Problema do usuário (português, exato)
> "clone esse aplicativo e corrija o chat para que ele analise o caso do cliente
> e seja mais humanizado possivel verifique por que o audio nao esta saindo
> corrija com essa voz sempre que chat estive em duvida e responder a palavra
> (ou) uma coisa ou outra ele nao responda faca preguntas sobre o caso do
> cliente para chegar numa resposta mais precisa e atulize o chat todos dias
> com novas informacoes e atualizacoes da legislacao e me der um indice de
> acertividade do caso no painel administrativo qualificando ou nao o cliente"

### Implementação completa
1. **Chat IA humanizado** (`POST /api/chat/message`)
   - Modelo: **GPT-5.2** (OpenAI via Emergent LLM Key) com fallback gpt-4o.
   - Persona "Dra. Ana", advogada virtual, tom acolhedor, frases curtas, emoji sutil.
   - **Regra anti-"ou"**: quando ambígua, NÃO responde "X ou Y" — converte em
     pergunta numerada para o cliente (ex: "1) Você tinha CLT? 2) Ainda no aviso?").
   - Gera **áudio MP3** automaticamente (OpenAI TTS, voz `nova` default —
     selecionável: nova/shimmer/coral/fable/alloy/onyx/echo).
   - Retorna `analysis` estruturado: `acertividade` (0-100), `chance_exito`
     (0-100), `qualificacao` (qualificado / nao_qualificado / necessita_mais_info),
     `area`, `resumo`, `motivo`, `proxima_pergunta`, `fundamentos[]`.
2. **Atualização diária de legislação** — `db.legislation_cache` com chave por
   data (TTL diário). Endpoint `GET /api/legislation/today` + `POST /api/legislation/refresh`
   (admin). Brief é injetado no system prompt do chat com a data atual.
3. **Painel administrativo** (`/app/admin`)
   - `GET /api/admin/case-analyses` — KPIs (total, qualificados, não qualif,
     +info, acertividade média, chance êxito média) + lista filtrada.
   - `GET /api/admin/case-analyses/{id}` — detalhe + transcript completo.
   - `PATCH /api/admin/case-analyses/{id}` — admin sobrescreve qualificação +
     anotação interna (`admin_notes`, `manual_review=True`).
4. **Auto-seed admin** no startup (`_seed_admin_user`):
   - admin@kenia-garcia.com.br / Kenia@Admin2026 (is_admin=True, role=admin).
5. **Frontend novas páginas**:
   - `/app/chat-ia` — Chat humanizado split: chat à esquerda + sidebar com
     gauges (Acertividade %, Chance Êxito %, Qualif badge), área do direito,
     resumo, motivo, **próxima pergunta sugerida** (botão "Usar essa pergunta"),
     fundamentos jurídicos, atualização legal do dia. Áudio com play/pause inline.
   - `/app/admin` — Painel admin com KPIs + lista + detalhe + override.
   - Sidebar atualizada com 2 novos itens: "Chat IA · Análise" e "Painel Admin · Casos".
6. **Dashboard AI Copilot** (existente) também ganhou auto-play de áudio
   + badge inline de acertividade na resposta.

### Validação (testing_agent_v3 iteration_9)
- 18/18 testes pytest passando (100%) — auth admin, chat humanizado com TTS +
  análise, admin case-analyses (CRUD), legislation today/refresh, persistência
  de análise por session_id.
- Tempo médio do `/api/chat/message`: 25-40s (3 LLM calls + TTS).
- Áudio MP3 gerado: ~30-120KB base64.

### Backlog para próxima sessão
- [ ] Otimizar chat: rodar TTS + `_analyze_case_session` em paralelo com
      `asyncio.gather()` (corta ~40% latência).
- [ ] Rate-limit por IP/session no `/api/chat/message` (endpoint público).
- [ ] Validador Pydantic para o campo `voice` (whitelist OpenAI).
- [ ] TTL index no `db.legislation_cache` (auto-cleanup > 30 dias).
- [ ] Refatorar server.py (3611 linhas) em módulos.

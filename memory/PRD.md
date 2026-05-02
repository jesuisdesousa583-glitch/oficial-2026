# PRD — Kênia Garcia Advocacia (Estúdio Jurídico Inteligente)

## Problema original do usuário
> "clone esse aplicativo e verifique por que o chat não está funcionando, faça todos os testes com todas as funcionalidades"

## Arquitetura
- **Backend**: FastAPI (Python) — `/app/backend/server.py`
- **Frontend**: React/CRA — `/app/frontend/src/`
- **WhatsApp Sidecar**: Node.js Baileys (`/app/baileys-service/server.js`, porta 8002)
- **Banco**: MongoDB local (`test_database`)
- **IA**: Emergent LLM Key — gpt-5.2 / gpt-4o-mini / Whisper-1 / OpenAI TTS

## Personas
- **Administradora**: Dra. Kênia Garcia (titular)
- **Bot WhatsApp**: "Natália" (secretária jurídica)
- **Chat IA público**: "Dra. Ana"

## Histórico de correções nesta sessão (02-Mai-2026)

### 1️⃣ Bug do webhook Baileys (token mismatch) — RESOLVIDO
- Default token divergia entre backend (`espirito-santo-baileys-2026`) e sidecar (`legalflow-baileys-2026`).
- Fix: `/app/backend/server.py` linha 2468 unificou para `legalflow-baileys-2026`. Variáveis explícitas em `/app/backend/.env`.
- **Validação**: 16/16 testes passaram (iteration_1).

### 2️⃣ Player de áudio mudo no Chat IA (Ana) — RESOLVIDO
- Causa: navegador bloqueava `audio.play()` com `NotAllowedError` (autoplay policy).
- Fix em `/app/frontend/src/pages/ChatIA.jsx`:
  - Toast informativo quando autoplay é bloqueado
  - Toast de erro genérico quando audio falha
  - **`<audio controls>` HTML5 nativo** sob cada resposta da Ana — controle 100% do navegador, com volume slider, timeline, download.

### 3️⃣ Bot enviar áudio (TTS) pelo WhatsApp do cliente automaticamente — IMPLEMENTADO
**Backend** (`/app/backend/server.py`):
- Novos campos em `WhatsAppConfig`:
  - `bot_voice_mode`: `text_only` | `text_and_audio` (default opção B) | `audio_only` (opção A) | `auto`
  - `bot_voice`: nova/shimmer/coral/fable/alloy/onyx/echo (default `nova`)
- `_maybe_autorespond` refatorada: gera TTS via OpenAI e envia via `/send-audio` do Baileys conforme config + flag `prefer_audio` do contato.
- Auto-detecção `prefer_audio=True` quando:
  - cliente envia áudio (mesmo se Whisper falhar — fallback "[áudio inaudível]")
  - heurística sutil de baixo letramento (mensagem curta + 2+ erros tipo "vc/tb/blz")
- Persiste flag em `whatsapp_contacts.prefer_audio` para conversas seguintes.
- `voice_mode_used` registrado em cada mensagem do bot (`text` | `text_audio` | `audio`).

**Frontend** (`/app/frontend/src/pages/WhatsAppSettings.jsx`):
- Bloco "Modo de voz da resposta" com 2 dropdowns (Modo + Voz da OpenAI TTS)
- Texto explicativo da detecção automática.

**Validação (testing agent v3 - iteration 2)**: 10/11 backend tests + 100% frontend OK. O 1 teste que falhou (audio sem transcrição → `prefer_audio` não setado) **já foi corrigido** depois dos testes (linha 2721-2728).

## Implementado / verificado
- [x] Setup do ambiente Python+Node+Mongo (zip do usuário)
- [x] Correção do token mismatch do webhook Baileys
- [x] Player áudio nativo no Chat IA
- [x] Modo de voz configurável (text_and_audio default, audio_only, auto, text_only)
- [x] Auto-detecção de cliente que prefere voz
- [x] Heurística de baixo letramento (sutil, sem expor ao cliente)
- [x] Voz da OpenAI TTS configurável (7 vozes)
- [x] Resposta com áudio automática mesmo quando Whisper falha
- [x] Validação end-to-end via testing agent (2 iterações)

## Backlog / próximos passos sugeridos
- **P1** Webhook retornar HTTP 401 quando token inválido (hoje 200+`ok:false`)
- **P1** Mover `BAILEYS_INTERNAL_TOKEN` para header `X-Internal-Token` (hoje no body, logado em INFO — risco de leak)
- **P1** Voice cloning real da Dra. Kênia → integração com **ElevenLabs** (precisa API key do usuário)
- **P2** Refatorar `server.py` (3.7k linhas) em routers separados
- **P2** Limpar dead code em `_maybe_autorespond` (linhas 2101-2104)
- **P3** Real-time updates via WebSocket no painel WhatsApp/CRM

## Próximas ações para o usuário
1. Acessar painel: `https://chat-debug-test.preview.emergentagent.com/login` com `admin@kenia-garcia.com.br` / `Kenia@Admin2026`
2. Em **WhatsApp** → seção "Modo de voz da resposta": testar trocando entre os 4 modos
3. Em **Chat IA · Análise**: enviar mensagens, clicar no player nativo HTML5 da Ana e verificar volume do navegador
4. Manda mensagem real do celular para o número Erik conectado e verifica que recebe **texto + áudio** no app.

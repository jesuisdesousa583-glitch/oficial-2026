# PRD — Kênia Garcia Advocacia (Estúdio Jurídico Inteligente)

## Problema original do usuário
> "clone esse aplicativo e verifique por que o chat não está funcionando, faça todos os testes com todas as funcionalidades"

## Arquitetura
- **Backend**: FastAPI (Python) — `/app/backend/server.py` (~3.9k linhas)
- **Frontend**: React/CRA — `/app/frontend/src/`
- **WhatsApp Sidecar**: Node.js Baileys (`/app/baileys-service/`)
- **Banco**: MongoDB
- **IA**: Emergent LLM Key (gpt-5.2/gpt-4o-mini/Whisper/OpenAI TTS) + ElevenLabs opcional

## Personas
- **Administradora**: Dra. Kênia Garcia (titular)
- **Bot WhatsApp**: **Nislainy** (secretária, conversa com clientes) — *bot_persona interno = "Kênia Garcia"*
- **Chat IA público (site)**: Ana (advogada virtual)

## Histórico de correções (02-Mai-2026)

### Iteração 1 — Webhook Baileys (token mismatch) ✅
- Default token divergia. Fix em `/app/backend/server.py` linha 2468 + `.env`. 16/16 testes.

### Iteração 2 — Chat IA audio mudo + Modo de voz WhatsApp ✅
- Player HTML5 nativo no Chat IA.
- Backend: `bot_voice_mode` (text_only|text_and_audio|audio_only|auto) e `bot_voice`. 4 modos selecionáveis.
- Auto-detecção `prefer_audio` (cliente mandou áudio OU sinais sutis de baixo letramento).
- Heurística de baixo letramento (sem expor ao cliente).
- Fallback áudio sem transcrição → bot pede pra repetir. 10/11 testes (1 minor corrigido).

### Iteração 3 — Renomeação + 7 áreas + humanização + ElevenLabs + Landing + Image fusion ✅
**Backend** (`/app/backend/server.py`):
- Bot renomeado **Natália → Nislainy** (apenas conversacional; bot_persona interno mantido).
- Prompt reforçado: **OBRIGATÓRIO se apresentar como Nislainy** em TODA primeira mensagem com cliente novo (validado em 3 áreas após reforço).
- **7 áreas de expertise**: Trabalhista, Família, Previdenciário, Cível, Consumidor, Criminal, Empresarial. Cada uma com roteiro específico de qualificação. Bot detecta área pelo relato e ativa roteiro SEM listar opções ao cliente.
- **Humanização**: typing delay = reading_time (50 chars/s) + typing_time (30 chars/s) + pausa 0.8-1.8s aleatória. Cap 10s. Cliente vê pausa natural antes da resposta.
- **Integração ElevenLabs**: endpoints `/api/whatsapp/elevenlabs/clone` (multipart upload), `/voices` (list), `/test` (gerar amostra). Salva `voice_id` em `whatsapp_config`. `_tts_generate` unificado: usa ElevenLabs se `voice_provider=elevenlabs` + `voice_id` configurado, senão OpenAI TTS via Emergent.

**Frontend**:
- `/app/frontend/src/pages/ChatIA.jsx`: `<audio>` agora usa **Blob URL** (`URL.createObjectURL`) em vez de data: URL — resolve definitivamente o áudio mudo em iOS Safari/Chrome mobile com arquivos >250KB-1MB. Novo componente `NativeAudioPlayer`.
- `/app/frontend/src/pages/WhatsAppSettings.jsx`: nova seção "Voz clonada (ElevenLabs)" com input de API key, dropdown voice_provider, file upload de áudio (.mp3/.wav/.m4a, 30-90s), botão "Clonar voz" e botão de teste.
- `/app/frontend/src/pages/Landing.jsx`: hero text colors corrigidos (text-nude-700 e text-gold-700 para legibilidade), nova imagem **/escritorio-hero.png** gerada via **Gemini Nano Banana** fundindo as 2 fotos enviadas (fachada real + letreiro "KÊNIA GARCIA ADVOCACIA" dourado, golden hour).

**Deploy manual** (`/app/DEPLOY_RENDER.md`):
- Manual completo (backend FastAPI Starter + Baileys Node Starter com disco persistente + frontend Static + MongoDB Atlas Free + ElevenLabs opcional).
- Custo estimado: ~$14-19/mês.

**Validação (testing agent v3 - iteração 3)**: 6/6 backend + 100% frontend OK. Bot Nislainy validado em 3 áreas (trabalhista, previdenciário, família, empresarial) após reforço de prompt.

## Backlog / próximos passos
- **P1** Webhook async + BackgroundTask (humanização pode estourar 25s em casos longos)
- **P1** Mover `BAILEYS_INTERNAL_TOKEN` para header `X-Internal-Token`
- **P2** Refatorar `server.py` (3.9k linhas) em routers (auth, whatsapp, crm, chat, finance, admin, elevenlabs)
- **P2** Endpoint DELETE `/api/whatsapp/contacts/{id}` (testing agent reportou que não existe)
- **P2** Hydration warning `<span>` em `<option>` no Select shadcn
- **P3** Dashboard "leads quentes do dia" + briefing diário em áudio para a Dra. (sugestão de evolução)

## Próximas ações para o usuário
1. **ElevenLabs**: Quando você gerar a API key em elevenlabs.io → no painel `/app/whatsapp`, role até "Voz clonada (ElevenLabs)" → cole a key → **Salvar** → faça upload de um áudio de 30-90s da Dra. Kênia falando claramente → clique "Clonar voz" → depois mude "Provedor de voz" para ElevenLabs → Salvar.
2. **Deploy Render**: siga `/app/DEPLOY_RENDER.md` passo-a-passo.
3. **Teste real**: mande mensagem de outro celular para o número Erik conectado. Nislainy deve responder em ~5-15s com nome do cliente + identificação automática de área.

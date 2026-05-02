# PRD — Kênia Garcia Advocacia (Estúdio Jurídico Inteligente)

## Problema original do usuário
> "clone esse aplicativo e verifique por que o chat não está funcionando, faça todos os testes com todas as funcionalidades"
>
> Detalhamento: "não responde as mensagens automáticas nem atualiza as mensagens recebidas". Prioridade nas conexões com WhatsApp.

## Arquitetura
- **Backend**: FastAPI (Python) — `/app/backend/server.py` (~3.6k linhas)
- **Frontend**: React/CRA — `/app/frontend/src/` (Login, Dashboard, CRM, ChatIA, Agenda, Processos, Finance, WhatsAppSettings, WhatsAppLogs, Settings, Onboarding…)
- **WhatsApp Sidecar**: Node.js Baileys (`/app/baileys-service/server.js`, porta 8002, watchdog automático no backend)
- **Banco**: MongoDB local (`test_database`)
- **IA**: Emergent LLM Key — gpt-5.2 / gpt-4o-mini / Whisper-1 / OpenAI TTS

## Personas
- **Administradora**: Dra. Kênia Garcia (titular do escritório)
- **Bot conversacional WhatsApp**: "Natália" (secretária jurídica), qualifica leads, agenda consultas
- **Chat IA público (site)**: "Dra. Ana", advogada virtual com brief diário de legislação

## Requisitos centrais
- Receber mensagens WhatsApp via Baileys e atualizar no painel em tempo (quase) real
- Responder automaticamente quando `bot_enabled=true` no `whatsapp_config`
- Transcrever áudios (Whisper) e analisar imagens/documentos (Vision) recebidos
- Classificar lead automaticamente (CRM Kanban) a partir da mensagem
- Chat IA público para captar visitantes
- Módulos de CRM, Agenda, Processos, Financeiro, Analytics

## Bug identificado e corrigido nesta sessão (02-Mai-2026)
**Sintoma**: Mensagens recebidas no WhatsApp não apareciam no painel; bot não respondia.

**Causa raiz**: Tokens internos divergentes
- `/api/whatsapp/webhook/baileys` (linha 2468) → default `"espirito-santo-baileys-2026"`
- `_spawn_baileys` (linha 3584) e `baileys-service/server.js` → default `"legalflow-baileys-2026"`

Resultado: todo webhook era rejeitado com `{ok:false, error:"unauthorized"}` antes de salvar a mensagem ou disparar o auto-reply.

**Correção aplicada**:
1. `/app/backend/server.py` linha 2468: default unificado para `"legalflow-baileys-2026"`
2. `/app/backend/.env`: explicitado `BAILEYS_INTERNAL_TOKEN=legalflow-baileys-2026` + `BAILEYS_URL` + `BACKEND_WEBHOOK` + `EMERGENT_LLM_KEY`

**Validação (testing agent v3 - iteração 1)**: 16/16 backend tests PASS, 100% navegação frontend OK
- POST webhook com token correto → `{ok:true}`, mensagem persistida, bot Natália gera resposta IA contextual, envio Baileys retorna `provider_status:200`
- POST webhook com token errado → rejeitado (segurança preservada)

## Implementado / verificado (02-Mai-2026)
- [x] Setup do ambiente Python+Node+Mongo a partir do zip enviado
- [x] Correção do token mismatch do webhook Baileys
- [x] Habilitado bot e provider=baileys no config do admin para teste
- [x] Validação end-to-end via testing agent (auth, webhook, contatos, mensagens, chat IA, CRM, agenda, processos, financeiro)
- [x] Baileys sidecar autenticado (sessão "Erik" preservada do `auth_info` enviado)

## Backlog / próximos passos sugeridos
- **P1** Endpoint webhook → retornar HTTP 401 quando token inválido (hoje 200+`ok:false`) para conformidade REST
- **P1** Mover token interno do Baileys do body JSON para header `X-Internal-Token` (evita log do token no INFO da linha 2466)
- **P2** PUT `/api/whatsapp/config` retornar o objeto atualizado (DX)
- **P2** Refatorar `server.py` (3.6k linhas) em routers (`auth`, `whatsapp`, `crm`, `chat`, `finance`, `admin`)
- **P2** Top-level imports do `emergentintegrations` (hoje importado dentro de funções)
- **P3** Real-time updates no CRM/WhatsApp via WebSocket (hoje depende de polling) para atualização imediata sem refresh

## Próximas ações para o usuário
1. Acessar painel: `https://chat-debug-test.preview.emergentagent.com/login` com `admin@kenia-garcia.com.br` / `Kenia@Admin2026`
2. Em **Configurações → WhatsApp**, confirmar que o **provider está como "Baileys"** e **Bot ativo (bot_enabled)**.
3. Conexão WhatsApp do Baileys já está autenticada como "Erik". Se quiser conectar outro número, ir em WhatsApp → Logout → escanear QR.
4. Enviar uma mensagem real de outro celular para o número conectado e validar que:
   - A conversa aparece no painel
   - A Natália responde automaticamente

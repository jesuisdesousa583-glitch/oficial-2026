# 🚀 Manual de Deploy — Render.com

Guia completo, passo-a-passo, para colocar **Kênia Garcia Advocacia** em produção no [Render.com](https://render.com).

> **Tempo estimado**: 30-45 minutos (primeira vez).  
> **Custo**: ~US$ 14-21/mês (Starter Web Service x2 + DB free 90 dias OU Render-managed Mongo via Atlas).

---

## 📋 Arquitetura em produção

| Componente | Tipo Render | Plano sugerido |
|---|---|---|
| **Backend FastAPI** (`/app/backend`) | Web Service | Starter ($7/mês, 512 MB RAM, **disco persistente +$1/GB**) |
| **Sidecar Baileys** (`/app/baileys-service`) | Web Service | Starter ($7/mês, **disco persistente OBRIGATÓRIO** para `auth_info/`) |
| **Frontend React** (`/app/frontend`) | Static Site | **Grátis** |
| **MongoDB** | externo | **MongoDB Atlas Free** (M0, 512 MB) — vide passo 1 |

---

## 1️⃣ Preparar o MongoDB (Atlas Free)

1. Vá em [cloud.mongodb.com](https://cloud.mongodb.com/) → criar conta gratuita
2. **Build a Database** → **M0 Free** → escolha região **São Paulo (sa-east-1)** ou a mais próxima
3. Cluster criado → **Database Access** → **Add New Database User**:
   - Username: `kenia-prod`
   - Password: gere uma forte (anote!)
   - Privilégios: `Read and write to any database`
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`) — necessário porque Render usa IPs dinâmicos.
5. Volte ao Cluster → **Connect** → **Drivers** → copie a connection string:
   ```
   mongodb+srv://kenia-prod:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   ⚠️ Troque `<password>` pelo password que você criou.

---

## 2️⃣ Preparar o repositório Git

No painel do Emergent, clique em **"Save to GitHub"** (botão no chat de input) → conecte sua conta GitHub → criar repositório (ex: `kenia-garcia-advocacia`).

---

## 3️⃣ Deploy do Backend (FastAPI)

### 3.1. Criar Web Service no Render
1. Em [dashboard.render.com](https://dashboard.render.com/) → **New +** → **Web Service**
2. Conecte seu GitHub → escolha o repositório `kenia-garcia-advocacia`
3. Configure:

| Campo | Valor |
|---|---|
| **Name** | `kenia-backend` |
| **Region** | São Paulo (ou mais próxima) |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | **Starter ($7/mês)** |

### 3.2. Variáveis de Ambiente (Environment)

Aba **Environment** → adicione **todas estas**:

```bash
MONGO_URL=mongodb+srv://kenia-prod:SUA_SENHA@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DB_NAME=kenia_garcia_prod
CORS_ORIGINS=https://kenia-frontend.onrender.com,https://kenia-garcia.com.br
EMERGENT_LLM_KEY=sk-emergent-b3dBa17118c132bC5A
BAILEYS_INTERNAL_TOKEN=GERAR_UMA_NOVA_TROCANDO_ESSE_TEXTO
BAILEYS_URL=https://kenia-baileys.onrender.com
BACKEND_WEBHOOK=https://kenia-backend.onrender.com/api/whatsapp/webhook/baileys
ADMIN_EMAIL=admin@kenia-garcia.com.br
ADMIN_PASSWORD=Kenia@Admin2026
JWT_SECRET=GERAR_OUTRA_RANDOM_64_CHARS
PYTHON_VERSION=3.11.10
```

> ⚠️ **CRÍTICO**: gere `BAILEYS_INTERNAL_TOKEN` e `JWT_SECRET` com `openssl rand -hex 32` ou em [randomkeygen.com](https://randomkeygen.com/) → strings de 32+ caracteres.

### 3.3. Clique em **Create Web Service**.

Aguarde build (5-10 min). Quando aparecer **Live** em verde, copie a URL → ex: `https://kenia-backend.onrender.com`.

---

## 4️⃣ Deploy do Sidecar Baileys (Node.js)

### 4.1. Criar **OUTRO** Web Service
1. **New + → Web Service** → mesmo repositório
2. Configure:

| Campo | Valor |
|---|---|
| **Name** | `kenia-baileys` |
| **Region** | mesma do backend |
| **Root Directory** | `baileys-service` |
| **Runtime** | `Node` |
| **Build Command** | `yarn install --frozen-lockfile` |
| **Start Command** | `node server.js` |
| **Instance Type** | **Starter ($7/mês)** |

### 4.2. ⚠️ DISCO PERSISTENTE (OBRIGATÓRIO)

Sem isso, **toda restart o WhatsApp desconecta** e você precisa escanear o QR Code de novo.

Aba **Disks** → **Add Disk**:

| Campo | Valor |
|---|---|
| **Name** | `auth-info` |
| **Mount Path** | `/opt/render/project/src/baileys-service/auth_info` |
| **Size** | **1 GB** ($0.25/mês) |

### 4.3. Environment Variables

```bash
BAILEYS_INTERNAL_TOKEN=MESMO_VALOR_DO_BACKEND
BACKEND_WEBHOOK=https://kenia-backend.onrender.com/api/whatsapp/webhook/baileys
PORT=8002
NODE_VERSION=20
```

> ⚠️ O `BAILEYS_INTERNAL_TOKEN` **DEVE SER IDÊNTICO** ao do backend, senão webhook é rejeitado com 401.

### 4.4. Clique **Create Web Service**.

---

## 5️⃣ Deploy do Frontend (React)

### 5.1. Criar Static Site

1. **New + → Static Site** → mesmo repositório
2. Configure:

| Campo | Valor |
|---|---|
| **Name** | `kenia-frontend` |
| **Branch** | `main` |
| **Root Directory** | `frontend` |
| **Build Command** | `yarn install && yarn build` |
| **Publish Directory** | `build` |

### 5.2. Environment Variables

```bash
REACT_APP_BACKEND_URL=https://kenia-backend.onrender.com
```

### 5.3. **Redirects/Rewrites** (importante pro React Router)

Aba **Redirects/Rewrites** → adicione:

| Source | Destination | Type |
|---|---|---|
| `/*` | `/index.html` | Rewrite |

### 5.4. Clique **Create Static Site**.

---

## 6️⃣ Pós-Deploy — Checklist final

### 6.1. Atualizar CORS no Backend
Volte no service `kenia-backend` → Environment → edite `CORS_ORIGINS`:
```
CORS_ORIGINS=https://kenia-frontend.onrender.com
```
(adicione também seu domínio próprio quando configurar)

### 6.2. Health checks
Testa pelo navegador:
- Backend: `https://kenia-backend.onrender.com/api/` → deve retornar `{"message":"...","status":"ok"}`
- Baileys: `https://kenia-baileys.onrender.com/health` → `{"ok":true,"service":"baileys"}`
- Frontend: abrir `https://kenia-frontend.onrender.com/` → landing carrega

### 6.3. Login no Painel
`https://kenia-frontend.onrender.com/login` → admin@kenia-garcia.com.br / Kenia@Admin2026

### 6.4. Conectar WhatsApp pela primeira vez
1. Painel → **WhatsApp** (lateral)
2. Clique em **Obter QR**
3. No celular: WhatsApp → ⋮ → **Aparelhos conectados** → **Conectar aparelho** → escaneie
4. Pronto. Mande uma mensagem de outro celular para o número e veja a **Nislainy** responder.

### 6.5. Configurar voice cloning (opcional)
Se quiser usar a voz clonada da Dra. Kênia:
1. Crie conta em [elevenlabs.io](https://elevenlabs.io/app/sign-up) → assine o **Starter $5/mês**
2. Em **Profile → API Keys** → gere uma nova → copie
3. No painel: **WhatsApp → "Voz clonada (ElevenLabs)"** → cole a API key → **Salvar**
4. Faça upload de um áudio de 30-90s da Dra. Kênia falando claramente
5. Clique **🎤 Clonar voz** → aguarde ~30s
6. Em **Provedor de voz**, mude para "ElevenLabs (voz clonada)" → **Salvar**

---

## ⚠️ Problemas Comuns

### "Backend retorna 500 ao logar"
- Verifique `MONGO_URL` (a senha do Atlas tem caracteres especiais? Use URL-encode)
- Network Access do Atlas precisa permitir `0.0.0.0/0`

### "WhatsApp não recebe mensagens"
- Logs do `kenia-baileys`: provavelmente o `BAILEYS_INTERNAL_TOKEN` está diferente entre os dois serviços.
- Confirme que `BACKEND_WEBHOOK` no Baileys aponta pro URL **público** do backend (não `localhost`).

### "QR Code não aparece"
- Disco persistente não foi montado em `/opt/render/project/src/baileys-service/auth_info`
- Sem disco, a cada deploy o auth_info é zerado.

### "Render coloca o serviço pra dormir"
Plano Starter **NÃO** dorme. Free plan dorme após 15 min de inatividade — o **Baileys NÃO pode estar no free**, senão WhatsApp desconecta sem parar.

### "Cold start do backend está lento (~30s)"
Adicione um cron externo (uptimerobot.com gratuito) que faz `GET https://kenia-backend.onrender.com/api/` a cada 5 minutos.

---

## 🔒 Hardening pós-deploy (recomendado)

1. **Trocar a senha do admin** após primeiro login:
   - Por enquanto a senha do admin está no ENV `ADMIN_PASSWORD`. Mude ela e faça redeploy.

2. **Domínio próprio** (kenia-garcia.com.br):
   - Render → Settings → **Custom Domain** → adicione
   - No Registro.br ou Cloudflare, aponte CNAME do subdomínio para o domínio do Render
   - Atualize `CORS_ORIGINS` no backend para incluir o domínio próprio

3. **Backups do MongoDB**:
   - Atlas Free não tem backup automático. Configure um cron mensal:
     ```bash
     mongodump --uri="$MONGO_URL" --out=backup-$(date +%F)
     ```

4. **Monitoramento**:
   - [uptimerobot.com](https://uptimerobot.com) → 50 checks grátis
   - Adicione: backend `/api/`, baileys `/health`, frontend `/`

---

## 📝 Checklist final

- [ ] MongoDB Atlas criado, IP `0.0.0.0/0` liberado, user `kenia-prod` com senha forte
- [ ] Backend deployed, `/api/` retorna `{"status":"ok"}`
- [ ] Baileys deployed **com disco persistente** em `/auth_info`
- [ ] Frontend deployed, abre sem erro 404 em rotas internas
- [ ] `BAILEYS_INTERNAL_TOKEN` **IDÊNTICO** nos 2 serviços
- [ ] `BACKEND_WEBHOOK` no Baileys aponta pro backend público
- [ ] `CORS_ORIGINS` no backend inclui URL do frontend
- [ ] Admin consegue logar
- [ ] QR Code do WhatsApp escaneado e mensagens recebidas/respondidas
- [ ] (Opcional) ElevenLabs API key configurada + voz clonada

---

## 💰 Custo mensal estimado

| Serviço | Plano | Custo |
|---|---|---|
| Backend FastAPI | Render Starter | $7 |
| Baileys Node | Render Starter | $7 |
| Disco persistente Baileys (1GB) | Render Disk | $0.25 |
| Frontend | Render Static (Free) | $0 |
| MongoDB Atlas | M0 Free | $0 |
| (Opcional) ElevenLabs | Starter | $5 |
| **TOTAL** | | **~$14.25-19.25/mês** |

> 💡 Após **3 meses**, considere migrar do Atlas Free para **Render Postgres + Mongo Compass** ou para um cluster **M2** ($9/mês). Free só dá 512 MB e pode ficar pequeno com 100+ conversas.

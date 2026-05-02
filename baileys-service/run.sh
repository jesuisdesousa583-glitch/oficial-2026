#!/bin/bash
# Watchdog script for Baileys sidecar.
# Keeps /app/baileys-service/server.js running on port 8002.
# Usage: nohup /app/baileys-service/run.sh > /var/log/baileys.log 2>&1 &

cd /app/baileys-service
export BAILEYS_PORT=8002
export BAILEYS_INTERNAL_TOKEN=legalflow-baileys-2026
export BACKEND_WEBHOOK=http://localhost:8001/api/whatsapp/webhook/baileys

while true; do
  echo "[$(date -u +%FT%TZ)] starting baileys sidecar..."
  node server.js
  code=$?
  echo "[$(date -u +%FT%TZ)] baileys exited with code $code — restarting in 3s"
  sleep 3
done

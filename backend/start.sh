#!/usr/bin/env bash
# ============================================================
# Start Script para o Backend no Render
# ============================================================
# O Render injeta a variavel $PORT automaticamente.
# ============================================================
set -o errexit

echo "==> Iniciando LegalFlow API na porta $PORT"
exec uvicorn server:app --host 0.0.0.0 --port "${PORT:-8001}" --workers 2

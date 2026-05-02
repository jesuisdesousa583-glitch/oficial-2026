#!/usr/bin/env bash
# ============================================================
# Build Script para o Backend no Render
# ============================================================
# O Render executa este arquivo como buildCommand quando configurado
# manualmente. Inclui a instalacao do pacote emergentintegrations
# que requer um index extra.
# ============================================================
set -o errexit

echo "==> Atualizando pip"
pip install --upgrade pip

echo "==> Instalando dependencias do requirements.txt"
pip install -r requirements.txt

echo "==> Instalando emergentintegrations (index alternativo)"
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

echo "==> Build concluido com sucesso"

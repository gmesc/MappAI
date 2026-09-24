#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv --system-site-packages .venv
fi
if ! .venv/bin/python -c 'import torch, transformers, sentencepiece' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt
fi
.venv/bin/python banco.py

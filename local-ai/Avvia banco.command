#!/bin/zsh
# Finder has a reduced PATH; use a user-installed Node, never a bundled AI runtime.
cd "${0:A:h}/.." || exit 1
source "$HOME/.nvm/nvm.sh" 2>/dev/null
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  echo 'Node.js non trovato. Apri il repository e usa npm run local-ai:review.'
  read -r '?Premi Invio per chiudere.'
  exit 1
fi
node local-ai/review-bank.cjs serve --open

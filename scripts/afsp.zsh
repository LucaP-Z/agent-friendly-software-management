#!/bin/zsh
# Start, stop and restart the Agentic Development System locally:
# backend (FastAPI) on :8000 and UI (Vite) on :5173.
#
#   scripts/afsp.zsh start      start both in the background and open the UI
#   scripts/afsp.zsh stop       stop both
#   scripts/afsp.zsh restart    stop, then start again (does not open a new browser tab)
#   scripts/afsp.zsh status     show what is running
#   scripts/afsp.zsh logs       follow both logs (Ctrl-C to quit)
#
# Linked projects live in ~/.agentic-dev/projects.json. For a throwaway registry:
#   AFSP_HOME=/tmp/afsp-scratch scripts/afsp.zsh start
# Set AFSP_NO_OPEN=1 to never open the browser. Logs and state: ~/.afsp-run/

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

SELF="${0:A}"
REPO="${SELF:h:h}"                 # this file lives in <repo>/scripts/
RUN="${AFSP_RUN_DIR:-$HOME/.afsp-run}"
API_PORT=8000                      # fixed: the UI dev proxy and the origin allow-list expect these
UI_PORT=5173
URL="http://127.0.0.1:$UI_PORT"

mkdir -p "$RUN"

pids_on_port() { lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null }

is_up() { [[ -n "$(pids_on_port "$1")" ]] }

stop_port() {  # $1 = port, $2 = label
  local pids
  pids=$(pids_on_port "$1")
  if [[ -z "$pids" ]]; then echo "  $2: not running"; return; fi
  kill ${=pids} 2>/dev/null
  for _ in {1..20}; do is_up "$1" || break; sleep 0.25; done
  if is_up "$1"; then kill -9 ${=$(pids_on_port "$1")} 2>/dev/null; fi
  echo "  $2: stopped"
}

start() {
  [[ -d "$REPO/backend" && -d "$REPO/frontend" ]] || { echo "Repo not found at $REPO"; exit 1; }
  command -v uv  >/dev/null || { echo "uv not found (brew install uv)";   exit 1; }
  command -v npm >/dev/null || { echo "npm not found (brew install node)"; exit 1; }

  if is_up $API_PORT || is_up $UI_PORT; then
    echo "Something is already listening on :$API_PORT or :$UI_PORT. Run '$SELF stop' (or restart) first."; exit 1
  fi

  [[ -d "$REPO/frontend/node_modules" ]] || { echo "Installing frontend dependencies..."; npm --prefix "$REPO/frontend" install || exit 1; }

  echo "Starting backend on :$API_PORT ..."
  nohup uv run --directory "$REPO/backend" uvicorn afsp.main:app \
    --host 127.0.0.1 --port $API_PORT --reload > "$RUN/backend.log" 2>&1 &

  echo "Starting UI on :$UI_PORT ..."
  nohup npm --prefix "$REPO/frontend" run dev -- --host 127.0.0.1 --port $UI_PORT --strictPort \
    > "$RUN/frontend.log" 2>&1 &

  for _ in {1..40}; do
    is_up $API_PORT && is_up $UI_PORT && break
    sleep 0.5
  done

  if is_up $API_PORT && is_up $UI_PORT; then
    echo "Up: $URL   (API docs: http://127.0.0.1:$API_PORT/api/docs)"
    echo "Logs: $RUN/backend.log, $RUN/frontend.log"
    [[ -n "$AFSP_NO_OPEN" ]] || open "$URL"
  else
    echo "Did not start cleanly. Last log lines:"
    tail -n 15 "$RUN/backend.log" "$RUN/frontend.log"
    exit 1
  fi
}

stop() {
  echo "Stopping..."
  stop_port $UI_PORT  "UI      (:$UI_PORT)"
  stop_port $API_PORT "backend (:$API_PORT)"
}

status() {
  if is_up $API_PORT; then echo "backend: running on :$API_PORT"; else echo "backend: stopped"; fi
  if is_up $UI_PORT;  then echo "UI:      running on $URL";      else echo "UI:      stopped"; fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; AFSP_NO_OPEN=1 start ;;   # you already have the tab open
  status)  status ;;
  logs)    tail -n 30 -f "$RUN/backend.log" "$RUN/frontend.log" ;;
  *)       echo "Usage: $SELF {start|stop|restart|status|logs}"; exit 1 ;;
esac

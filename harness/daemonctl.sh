#!/usr/bin/env bash
# start|stop|restart the offline harness daemon (pid: .tmp/daemon.pid, log: .tmp/daemon.log)
cd "$(dirname "$0")/.." || exit 1
mkdir -p .tmp
stop() {
  [ -f .tmp/daemon.pid ] && kill "$(cat .tmp/daemon.pid)" 2>/dev/null
  for p in $(pgrep -x node); do tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q '^node harness/daemon.mjs' && kill "$p"; done
  sleep 1
  for p in $(pgrep -x node); do tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q '^node harness/daemon.mjs' && kill -9 "$p"; done
  sleep 0.5
}
start() {
  nohup node harness/daemon.mjs > .tmp/daemon.log 2>&1 &
  echo $! > .tmp/daemon.pid
  for i in $(seq 1 20); do grep -q "ff daemon" .tmp/daemon.log 2>/dev/null && break; sleep 0.5; done
  tail -1 .tmp/daemon.log
}
case "$1" in stop) stop ;; restart) stop; start ;; *) start ;; esac

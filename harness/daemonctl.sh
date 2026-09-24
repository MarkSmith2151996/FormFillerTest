#!/usr/bin/env bash
# start|stop|restart the offline harness daemon (pid in .tmp/daemon.pid, log in .tmp/daemon.log)
cd "$(dirname "$0")/.." || exit 1
mkdir -p .tmp
stop() { [ -f .tmp/daemon.pid ] && kill "$(cat .tmp/daemon.pid)" 2>/dev/null; rm -f .tmp/daemon.pid; sleep 0.5; }
start() { nohup node harness/daemon.mjs > .tmp/daemon.log 2>&1 & echo $! > .tmp/daemon.pid; for i in 1 2 3 4 5 6 7 8 9 10; do grep -q "ff daemon" .tmp/daemon.log 2>/dev/null && break; sleep 0.5; done; cat .tmp/daemon.log; }
case "$1" in stop) stop ;; restart) stop; start ;; *) start ;; esac

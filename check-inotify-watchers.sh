#!/usr/bin/env bash
set -euo pipefail

printf 'max_user_watches='
cat /proc/sys/fs/inotify/max_user_watches
printf 'max_user_instances='
cat /proc/sys/fs/inotify/max_user_instances
printf 'max_queued_events='
cat /proc/sys/fs/inotify/max_queued_events
printf '\nProcesses with inotify fds:\n'

python - <<'PY'
import os, glob
rows=[]
for p in glob.glob('/proc/[0-9]*'):
    pid=int(p.split('/')[-1])
    try:
        comm=open(f'{p}/comm').read().strip()
    except Exception:
        continue
    total=0
    try:
        for fd in os.listdir(f'{p}/fdinfo'):
            try:
                text=open(f'{p}/fdinfo/{fd}').read()
            except Exception:
                continue
            total += text.count('inotify wd:')
    except Exception:
        continue
    if total:
        rows.append((total, pid, comm))
rows.sort(reverse=True)
for total, pid, comm in rows[:40]:
    print(f'{total:6d} {pid:6d} {comm}')
PY

echo
echo 'Command lines for the biggest consumers (edit PIDs as needed):'
for pid in 7893 7921 10990 7391 19091 18773 18459; do
  if [ -r "/proc/$pid/cmdline" ]; then
    printf 'PID %s: ' "$pid"
    tr '\0' ' ' < "/proc/$pid/cmdline"
    printf '\n'
  fi
done

#!/bin/bash
while true; do
  cd /home/martin/dev/aivester/server
  node index.js 2>&1
  echo "Server exited at $(date), restarting..."
  sleep 1
done

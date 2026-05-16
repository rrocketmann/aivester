#!/bin/bash
cd /home/martin/dev/aivester/server
while true; do
  node index.js >> /tmp/aivester-server.log 2>&1
  echo "Server exited with code $?, restarting..." >> /tmp/aivester-server.log
  sleep 1
done

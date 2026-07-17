#!/bin/bash
# Stride — permanent local launcher (started by com.stride.local LaunchAgent).
# LaunchAgents don't get the shell PATH, so point at the nvm node bin explicitly.
export PATH="/Users/jaymaheshwari/.nvm/versions/node/v22.20.0/bin:$PATH"
cd /Users/jaymaheshwari/Projects/Personal/stride || exit 1
# runs backend (nodemon, :5001) + frontend (vite, :5173) via concurrently
exec npm run dev

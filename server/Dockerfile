# The Operator API.
#
# WHY THIS EXISTS RATHER THAN A ROOT-DIRECTORY SETTING. The server deliberately
# does not own a copy of the reading engine — it imports the same
# electron/plainread/* the desktop app runs, so a reading can never differ
# between them. That means the image needs TWO directories from the repo, and a
# build scoped to server/ alone cannot see the second one.
#
# Copying the engine into server/ instead would create a second copy that drifts
# from the first, which is exactly the failure that produced the dead ASV button.

FROM node:20-slim

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a change to source does not re-install them.
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# The server, and the engine it borrows. Both paths are relative to the REPO
# root, so this image must be built with the repo root as its context.
COPY server ./server
COPY electron/plainread ./electron/plainread
COPY resources/theology-retrieval ./resources/theology-retrieval

# engine.js resolves the engine as path.join(__dirname, '../../electron/plainread'),
# which from /app/server/src lands on /app/electron/plainread. Keep this WORKDIR
# and that layout in step, or the import breaks exactly as it did the first time.
WORKDIR /app/server

ENV NODE_ENV=production
EXPOSE 8080

# Migration is idempotent — every statement is CREATE ... IF NOT EXISTS — so it
# runs on every boot and a schema change ships with the deploy that needs it.
CMD ["sh", "-c", "npm run migrate && npm start"]

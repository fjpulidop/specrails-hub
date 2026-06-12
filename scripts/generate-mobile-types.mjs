#!/usr/bin/env node
// Drift-proof contract for the Mobile Gateway.
//
// The gateway's /v1 surface and pairing QR are the contract between THIS repo
// (server/mobile/*) and the separate specrails-companion Flutter app. To keep the
// two from drifting, this script emits a JSON Schema describing every shape the
// gateway returns/accepts. The companion app regenerates its Dart DTOs from it:
//
//   node scripts/generate-mobile-types.mjs                 # writes the schema
//   cd ../specrails-companion
//   npx quicktype -s schema lib/data/contract/gateway.schema.json \
//     -o lib/data/gateway_dtos.g.dart --lang dart
//
// v1's companion uses hand-written tolerant parsers (lib/data/models.dart); this
// schema is the source of truth they mirror and the input for the generator when
// the contract grows. Keep this file in sync with server/mobile/mobile-router.ts
// (the allow-list) and mobile-types.ts (the QR payload).

import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SpecRails Mobile Gateway contract',
  definitions: {
    QrPayload: {
      type: 'object',
      // The 'hub' field name is frozen — mobile-app v1 wire compat — do not rename
      required: ['v', 'hub', 'name', 'addrs', 'port', 'fp', 'secret', 'claimId', 'exp'],
      properties: {
        v: { type: 'integer' },
        hub: { type: 'string' }, // mobile-app v1 wire compat — do not rename
        name: { type: 'string' },
        addrs: { type: 'array', items: { type: 'string' } },
        port: { type: 'integer' },
        fp: { type: 'string', description: 'sha256 hex of the gateway cert DER (pin target)' },
        secret: { type: 'string' },
        claimId: { type: 'string' },
        exp: { type: 'integer' },
      },
    },
    Project: {
      type: 'object',
      required: ['id', 'name', 'providers'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        providers: { type: 'array', items: { type: 'string' } },
      },
    },
    Ticket: {
      type: 'object',
      required: ['id', 'title', 'status'],
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'cancelled', 'draft'] },
        priority: { type: ['string', 'null'] },
        labels: { type: 'array', items: { type: 'string' } },
      },
    },
    Job: {
      type: 'object',
      required: ['id', 'command', 'status'],
      properties: {
        id: { type: 'string' },
        command: { type: 'string' },
        status: { type: 'string' },
        startedAt: { type: ['string', 'null'] },
        finishedAt: { type: ['string', 'null'] },
        total_cost_usd: { type: ['number', 'null'] },
        model: { type: ['string', 'null'] },
        duration_ms: { type: ['integer', 'null'] },
        num_turns: { type: ['integer', 'null'] },
      },
    },
    QueueSnapshot: {
      type: 'object',
      required: ['jobs', 'paused'],
      properties: {
        jobs: { type: 'array', items: { $ref: '#/definitions/Job' } },
        activeJobId: { type: ['string', 'null'] },
        paused: { type: 'boolean' },
      },
    },
  },
}

const outDir = path.resolve(__dirname, '..', '..', 'specrails-companion', 'lib', 'data', 'contract')
const fallbackDir = path.resolve(__dirname, '..', 'build')
const target = fs.existsSync(path.dirname(outDir)) ? outDir : fallbackDir
fs.mkdirSync(target, { recursive: true })
const outFile = path.join(target, 'gateway.schema.json')
fs.writeFileSync(outFile, JSON.stringify(schema, null, 2) + '\n')
console.log(`[generate-mobile-types] wrote ${outFile}`)
console.log('[generate-mobile-types] regenerate Dart DTOs with:')
console.log('  npx quicktype -s schema lib/data/contract/gateway.schema.json -o lib/data/gateway_dtos.g.dart --lang dart')

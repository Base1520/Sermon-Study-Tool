import assert from 'node:assert/strict'
import { openPendingModelRequest } from './modelRequestLedger.ts'

class MemoryStorage {
  values = new Map()

  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

const memory = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memory,
})

const privateKey = JSON.stringify({
  studyId: 'study-1',
  question: 'Private pastoral question that must not be stored here',
  history: [],
})
const first = await openPendingModelRequest('ask', privateKey)
const afterRestart = await openPendingModelRequest('ask', privateKey)
assert.equal(afterRestart.id, first.id, 'a restart must recover the same request id')

const stored = [...memory.values.values()].join('\n')
assert.equal(stored.includes('Private pastoral question'), false, 'the ledger must not store request content')

first.clear()
const deliberateNewAttempt = await openPendingModelRequest('ask', privateKey)
assert.notEqual(deliberateNewAttempt.id, first.id, 'clearing a terminal request must mint a new id')
deliberateNewAttempt.clear()

for (let index = 0; index < 140; index += 1) {
  await openPendingModelRequest('quick-study', `reference-${index}`)
}
const bounded = JSON.parse([...memory.values.values()][0])
assert.equal(Object.keys(bounded).length, 128, 'abandoned crash entries must stay bounded')

console.log('mobile durable model-request ledger passed')


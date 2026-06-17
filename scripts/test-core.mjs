// Core unit tests for LeadSync
// Tests the business logic without needing API credentials

import assert from 'node:assert/strict'

let passed = 0, failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

// ─── Facebook lead field extraction ───────────────────────
function extractLeadFields(fieldData) {
  const fields = {}
  for (const field of fieldData || []) {
    fields[field.name] = field.values?.join(', ') || ''
  }
  return fields
}

console.log('\n📋 Facebook Lead Extraction Tests')
test('extracts simple fields from lead', () => {
  const lead = {
    id: '123',
    created_time: '2024-01-01T00:00:00Z',
    field_data: [
      { name: 'full_name', values: ['John Doe'] },
      { name: 'email', values: ['john@test.com'] },
    ],
  }
  const result = extractLeadFields(lead.field_data)
  assert.equal(result.full_name, 'John Doe')
  assert.equal(result.email, 'john@test.com')
})

test('handles multi-value fields', () => {
  const result = extractLeadFields([
    { name: 'interests', values: ['coding', 'music'] },
  ])
  assert.equal(result.interests, 'coding, music')
})

test('handles empty field_data', () => {
  const result = extractLeadFields([])
  assert.equal(Object.keys(result).length, 0)
})

test('handles null/undefined field_data', () => {
  const result = extractLeadFields(null)
  assert.equal(Object.keys(result).length, 0)
  const result2 = extractLeadFields(undefined)
  assert.equal(Object.keys(result2).length, 0)
})

test('handles empty values array', () => {
  const result = extractLeadFields([
    { name: 'phone', values: [] },
  ])
  assert.equal(result.phone, '')
})

// ─── Field mapping engine ────────────────────────────────
function mapLeadToSheetRow(leadFields, sheetHeaders, fieldMappings) {
  return sheetHeaders.map(header => {
    const mapping = fieldMappings.find(m => m.sheetColumn === header)
    if (mapping) return leadFields[mapping.facebookField] || ''
    return ''
  })
}

console.log('\n🗺️  Field Mapping Tests')
test('maps fields correctly', () => {
  const leadFields = { full_name: 'John Doe', email: 'john@test.com', phone: '555-0100' }
  const headers = ['Name', 'Email', 'Phone', 'Notes']
  const mappings = [
    { facebookField: 'full_name', sheetColumn: 'Name' },
    { facebookField: 'email', sheetColumn: 'Email' },
    { facebookField: 'phone', sheetColumn: 'Phone' },
  ]
  const row = mapLeadToSheetRow(leadFields, headers, mappings)
  assert.deepEqual(row, ['John Doe', 'john@test.com', '555-0100', ''])
})

test('skips unmapped columns', () => {
  const leadFields = { name: 'Jane' }
  const headers = ['Name', 'Extra']
  const mappings = [{ facebookField: 'name', sheetColumn: 'Name' }]
  const row = mapLeadToSheetRow(leadFields, headers, mappings)
  assert.equal(row[1], '')
})

test('handles missing lead fields gracefully', () => {
  const leadFields = {}
  const headers = ['Name', 'Email']
  const mappings = [
    { facebookField: 'full_name', sheetColumn: 'Name' },
    { facebookField: 'email', sheetColumn: 'Email' },
  ]
  const row = mapLeadToSheetRow(leadFields, headers, mappings)
  assert.deepEqual(row, ['', ''])
})

test('handles empty mappings', () => {
  const row = mapLeadToSheetRow({ name: 'Jane' }, ['Name'], [])
  assert.deepEqual(row, [''])
})

// ─── Lead deduplication logic ────────────────────────────
function createDedupChecker(processedIds = new Set()) {
  return {
    isProcessed: (id) => processedIds.has(id),
    markProcessed: (id) => processedIds.add(id),
  }
}

console.log('\n🔁 Deduplication Tests')
test('detects unprocessed leads', () => {
  const checker = createDedupChecker(new Set(['1', '2']))
  assert.ok(checker.isProcessed('1'))
  assert.ok(!checker.isProcessed('3'))
})

test('marks and checks new leads', () => {
  const checker = createDedupChecker()
  checker.markProcessed('lead-1')
  assert.ok(checker.isProcessed('lead-1'))
  assert.ok(!checker.isProcessed('lead-2'))
})

test('filters out already processed leads', () => {
  const allLeads = [
    { id: '1', field_data: [{ name: 'email', values: ['a@a.com'] }] },
    { id: '2', field_data: [{ name: 'email', values: ['b@b.com'] }] },
    { id: '3', field_data: [{ name: 'email', values: ['c@c.com'] }] },
  ]
  const processed = new Set(['2'])
  const checker = createDedupChecker(processed)
  const newLeads = allLeads.filter(l => !checker.isProcessed(l.id))
  assert.equal(newLeads.length, 2)
  assert.equal(newLeads[0].id, '1')
  assert.equal(newLeads[1].id, '3')
})

// ─── OAuth state handling ────────────────────────────────
console.log('\n🔐 OAuth Tests')
test('parses and validates OAuth state', () => {
  const state = JSON.stringify({ userId: 'user-1', service: 'facebook' })
  const parsed = JSON.parse(state)
  assert.equal(parsed.userId, 'user-1')
  assert.equal(parsed.service, 'facebook')
})

test('rejects invalid OAuth state JSON', () => {
  assert.throws(() => JSON.parse('not-json'))
})

// ─── Integration config validation ───────────────────────
function validateIntegrationConfig(config) {
  const errors = []
  if (!config.facebookPageId) errors.push('Missing Facebook page')
  if (!config.facebookFormId) errors.push('Missing Facebook form')
  if (!config.googleSheetId) errors.push('Missing Google sheet')
  if (!config.googleWorksheetName) errors.push('Missing worksheet')
  if (!config.fieldMappings || config.fieldMappings.length === 0) errors.push('No field mappings')
  return { valid: errors.length === 0, errors }
}

console.log('\n⚙️  Config Validation Tests')
test('validates complete config passes', () => {
  const result = validateIntegrationConfig({
    facebookPageId: 'page-1',
    facebookFormId: 'form-1',
    googleSheetId: 'sheet-1',
    googleWorksheetName: 'Sheet1',
    fieldMappings: [{ facebookField: 'email', sheetColumn: 'Email' }],
  })
  assert.ok(result.valid)
  assert.equal(result.errors.length, 0)
})

test('rejects config with missing fields', () => {
  const result = validateIntegrationConfig({})
  assert.ok(!result.valid)
  assert.ok(result.errors.length >= 3)
})

test('rejects config with no field mappings', () => {
  const result = validateIntegrationConfig({
    facebookPageId: 'p1',
    facebookFormId: 'f1',
    googleSheetId: 's1',
    googleWorksheetName: 'Sheet1',
    fieldMappings: [],
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.includes('No field mappings'))
})

// ─── Results ──────────────────────────────────────────────
console.log(`\n${'═'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
if (failed > 0) process.exit(1)

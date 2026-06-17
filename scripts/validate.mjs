import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function ok(msg) { console.log(`  ✅ ${msg}`) }
function fail(msg) { console.log(`  ❌ ${msg}`); process.exitCode = 1 }

// Built frontend
const html = fs.readFileSync(path.join(ROOT, 'frontend', 'dist', 'index.html'), 'utf-8')
if (html.includes('LeadSync') && html.includes('root')) ok('Built frontend index.html valid')
else fail('Frontend index.html invalid')

// Components
const compDir = path.join(ROOT, 'frontend', 'src', 'components')
for (const c of ['Home', 'Dashboard', 'NewIntegration', 'History']) {
  if (fs.existsSync(path.join(compDir, `${c}.tsx`))) ok(`Component: ${c}`)
  else fail(`Missing component: ${c}`)
}

// Functions
const fnDir = path.join(ROOT, 'netlify', 'functions')
for (const f of ['oauth-facebook', 'oauth-google', 'oauth-callback', 'list-pages', 'list-forms', 'list-spreadsheets', 'list-worksheets', 'get-form-fields', 'get-sheet-headers', 'integrations', 'get-history', 'poll-leads']) {
  if (fs.existsSync(path.join(fnDir, `${f}.ts`))) ok(`Function: ${f}`)
  else fail(`Missing function: ${f}`)
}

// Libraries
for (const f of ['facebook.ts', 'google-sheets.ts', 'supabase.ts']) {
  if (fs.existsSync(path.join(fnDir, 'lib', f))) ok(`Library: ${f}`)
  else fail(`Missing lib: ${f}`)
}

// Config files
for (const f of ['netlify.toml', 'supabase/schema.sql', '.env.example']) {
  if (fs.existsSync(path.join(ROOT, f))) ok(`Config: ${f}`)
  else fail(`Missing: ${f}`)
}

// Facebook lib exports
const fbContent = fs.readFileSync(path.join(fnDir, 'lib', 'facebook.ts'), 'utf-8')
for (const e of ['fetchUserPages', 'fetchPageForms', 'fetchLeads', 'extractLeadFields', 'fetchFormStructure']) {
  if (fbContent.includes(`export async function ${e}`) || fbContent.includes(`export function ${e}`)) ok(`FB export: ${e}`)
  else fail(`Missing FB export: ${e}`)
}

// Google Sheets lib exports
const gsContent = fs.readFileSync(path.join(fnDir, 'lib', 'google-sheets.ts'), 'utf-8')
for (const e of ['getSheetsClient', 'getSpreadsheets', 'getWorksheets', 'getSheetHeaders', 'appendRow']) {
  if (gsContent.includes(`export async function ${e}`) || gsContent.includes(`export function ${e}`)) ok(`GS export: ${e}`)
  else fail(`Missing GS export: ${e}`)
}

// Supabase lib exports
const sbContent = fs.readFileSync(path.join(fnDir, 'lib', 'supabase.ts'), 'utf-8')
const sbExports = ['getUser', 'getConnection', 'saveConnection', 'getIntegrations', 'getActiveIntegrations', 'isLeadProcessed', 'markLeadProcessed', 'addAuditLog']
for (const e of sbExports) {
  if (sbContent.includes(`export async function ${e}`)) ok(`Supabase export: ${e}`)
  else fail(`Missing Supabase export: ${e}`)
}

console.log(`\n${'═'.repeat(40)}`)
console.log(process.exitCode ? 'Some checks FAILED' : 'All checks PASSED')

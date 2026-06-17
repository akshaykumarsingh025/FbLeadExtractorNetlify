import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8888
const DIST = path.resolve(__dirname, '..', 'netlify', 'functions', 'dist')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Load compiled Netlify Functions
const functionFiles = fs.readdirSync(DIST, { withFileTypes: true })
  .filter(f => f.isFile() && f.name.endsWith('.js'))
  .map(f => f.name)
const functionMap = {}

for (const file of functionFiles) {
  const name = file.replace('.js', '')
  const filePath = path.join(DIST, file)
  const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
  const mod = await import(fileUrl)
  functionMap[name] = mod.handler
}

// Map API routes to functions
const routeMap = {
  'oauth-facebook': '/api/oauth-facebook',
  'oauth-google': '/api/oauth-google',
  'oauth-callback': '/api/oauth-callback',
  'list-pages': '/api/list-pages',
  'list-forms': '/api/list-forms',
  'list-spreadsheets': '/api/list-spreadsheets',
  'list-worksheets': '/api/list-worksheets',
  'get-form-fields': '/api/get-form-fields',
  'get-sheet-headers': '/api/get-sheet-headers',
  'get-history': '/api/get-history',
  'poll-leads': '/api/poll-leads',
}

// Serve API functions
for (const [functionName, routePath] of Object.entries(routeMap)) {
  const handler = functionMap[functionName]
  if (!handler) {
    console.warn(`⚠ No handler found for ${functionName}`)
    continue
  }

  app.all(routePath, async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      queryStringParameters: req.query,
      body: JSON.stringify(req.body),
    }
    try {
      const result = await handler(event)
      res.status(result.statusCode || 200)
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          res.setHeader(k, v)
        }
      }
      // Handle redirects
      if (result.headers?.Location) {
        return res.redirect(result.headers.Location)
      }
      res.send(result.body || '')
    } catch (err) {
      console.error(`Error in ${functionName}:`, err)
      res.status(500).send(String(err))
    }
  })
}

// Serve frontend static files
const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist')
app.use(express.static(frontendDist))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`\n🚀 LeadSync Test Server running at http://localhost:${PORT}`)
  console.log(`   API: http://localhost:${PORT}/api/`)
  console.log(`   Frontend: http://localhost:${PORT}/\n`)
})

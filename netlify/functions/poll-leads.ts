import type { Handler, HandlerEvent } from '@netlify/functions'
import {
  getActiveIntegrations,
  batchCheckProcessedLeads,
  batchMarkLeadsProcessed,
  addAuditLog,
  updateIntegrationLastPolled,
} from './lib/supabase.js'
import { fetchLeads, extractLeadFields, ensureFacebookToken } from './lib/facebook.js'
import { ensureAccessToken, getSheetHeaders, appendRows } from './lib/google-sheets.js'

/**
 * Optimized for Netlify free tier (10-second timeout):
 * - Integrations processed in parallel (Promise.allSettled)
 * - Lead dedup uses batch query (1 query for all leads, not N)
 * - Leads marked processed via batch upsert (1 insert, not N)
 * - Facebook fetch + Google token refresh happen in parallel
 * - Duplicate-safe via UNIQUE constraint + upsert ignoreDuplicates
 */
export const handler: Handler = async (event: HandlerEvent) => {
  // Require a shared secret for any request that doesn't originate from the
  // in-app "Sync Now" button (which sends a JSON body). This prevents the
  // public /api/poll-leads URL from being abused to drain the function quota.
  const cronSecret = event.headers?.['x-cron-secret']
  const fromUI = event.httpMethod === 'POST' && event.body
  if (process.env.CRON_SECRET) {
    if (cronSecret !== process.env.CRON_SECRET && !fromUI) {
      return { statusCode: 401, body: 'Unauthorized' }
    }
  }

  try {
    const integrations = await getActiveIntegrations()

    // Process all integrations in parallel to maximize throughput
    // within the 10-second Netlify free tier timeout
    const settled = await Promise.allSettled(
      integrations.map(integration => processIntegration(integration))
    )

    const results = settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      return {
        integration: integrations[i].name,
        leads: 0,
        error: result.reason instanceof Error ? result.reason.message : 'Failed',
      }
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processed: results }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed'
    return { statusCode: 500, body: message }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processIntegration(integration: any) {
  const fbConn = integration.facebook_connection
  const gsConn = integration.google_connection
  if (!fbConn || !gsConn) {
    return { integration: integration.name, leads: 0 }
  }

  // Step 1: Fetch leads from Facebook + refresh Google token in parallel
  const [leads, gsToken] = await Promise.all([
    fetchLeads(integration.facebook_form_id, await ensureFacebookToken(fbConn)),
    ensureAccessToken(gsConn),
  ])

  if (leads.length === 0) {
    await updateIntegrationLastPolled(integration.id)
    return { integration: integration.name, leads: 0 }
  }

  // Step 2: Batch check which leads are already processed (1 query, not N)
  const leadIds = leads.map(l => l.id)
  const processedIds = await batchCheckProcessedLeads(integration.id, leadIds)
  const newLeads = leads.filter(l => !processedIds.has(l.id))

  if (newLeads.length === 0) {
    await updateIntegrationLastPolled(integration.id)
    return { integration: integration.name, leads: 0 }
  }

  // Step 3: Get sheet headers + build rows for all new leads
  const sheetHeaders = await getSheetHeaders(
    gsToken,
    integration.google_sheet_id,
    integration.google_worksheet_name
  )

  const fieldMappings = (integration.field_mappings as Array<{
    facebookField: string
    sheetColumn: string
  }>) || []

  const extractedLeads = newLeads.map(lead => {
    const extracted = extractLeadFields(lead)
    const row: string[] = sheetHeaders.map(header => {
      const mapping = fieldMappings.find(m => m.sheetColumn === header)
      return mapping ? (extracted[mapping.facebookField] || '') : ''
    })
    return { lead, extracted, row }
  })

  try {
    // Step 4: Append ALL rows to Google Sheets in one batch API call
    const result = await appendRows(
      gsToken,
      integration.google_sheet_id,
      integration.google_worksheet_name,
      extractedLeads.map(el => el.row)
    )
    const sheetRowId = result.updates?.updatedRange || ''

    // Step 5: Batch mark all leads as processed (1 upsert, not N inserts)
    // Uses ignoreDuplicates to safely handle any race conditions
    await batchMarkLeadsProcessed(
      extractedLeads.map(el => ({
        integrationId: integration.id,
        facebookLeadId: el.lead.id,
        facebookFormId: integration.facebook_form_id,
        data: el.extracted,
        sheetRowId,
        status: 'processed' as const,
      }))
    )

    // Step 6: Update metadata in parallel
    await Promise.all([
      updateIntegrationLastPolled(integration.id),
      addAuditLog({
        integrationId: integration.id,
        eventType: 'poll.completed',
        details: { leadsProcessed: extractedLeads.length },
      }),
    ])

    return { integration: integration.name, leads: extractedLeads.length }
  } catch (writeErr) {
    const msg = writeErr instanceof Error ? writeErr.message : 'Write failed'

    // Batch mark all as failed (still dedupe-safe via upsert)
    await batchMarkLeadsProcessed(
      extractedLeads.map(el => ({
        integrationId: integration.id,
        facebookLeadId: el.lead.id,
        facebookFormId: integration.facebook_form_id,
        data: el.extracted,
        status: 'failed' as const,
        errorMessage: msg,
      }))
    )

    await addAuditLog({
      integrationId: integration.id,
      eventType: 'poll.failed',
      details: { error: msg, leadsAttempted: extractedLeads.length },
    })

    return { integration: integration.name, leads: 0, error: msg }
  }
}

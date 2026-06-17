import type { Handler, HandlerEvent } from '@netlify/functions'
import {
  getActiveIntegrations,
  isLeadProcessed,
  markLeadProcessed,
  addAuditLog,
  updateIntegrationLastPolled,
} from './lib/supabase.js'
import { fetchLeads, extractLeadFields } from './lib/facebook.js'
import { getSheetHeaders, appendRow } from './lib/google-sheets.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const cronSecret = event.headers?.['x-cron-secret']
  if (cronSecret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const results: Array<{ integration: string; leads: number }> = []

  try {
    const integrations = await getActiveIntegrations()

    for (const integration of integrations) {
      let leadsProcessed = 0

      try {
        const fbConn = integration.facebook_connection
        const gsConn = integration.google_connection
        if (!fbConn || !gsConn) continue

        const leads = await fetchLeads(
          integration.facebook_form_id,
          fbConn.access_token
        )

        const sheetHeaders = await getSheetHeaders(
          gsConn.access_token,
          integration.google_sheet_id,
          integration.google_worksheet_name
        )

        const fieldMappings = (integration.field_mappings as Array<{
          facebookField: string
          sheetColumn: string
        }>) || []

        for (const lead of leads) {
          const alreadyProcessed = await isLeadProcessed(integration.id, lead.id)
          if (alreadyProcessed) continue

          const extracted = extractLeadFields(lead)
          const row: string[] = sheetHeaders.map(header => {
            const mapping = fieldMappings.find(m => m.sheetColumn === header)
            if (mapping) return extracted[mapping.facebookField] || ''
            return ''
          })

          try {
            const result = await appendRow(
              gsConn.access_token,
              integration.google_sheet_id,
              integration.google_worksheet_name,
              row
            )
            const sheetRowId = result.updates?.updatedRange || ''

            await markLeadProcessed({
              integrationId: integration.id,
              facebookLeadId: lead.id,
              facebookFormId: integration.facebook_form_id,
              data: extracted,
              sheetRowId,
              status: 'processed',
            })

            leadsProcessed++
          } catch (writeErr) {
            const msg = writeErr instanceof Error ? writeErr.message : 'Write failed'
            await markLeadProcessed({
              integrationId: integration.id,
              facebookLeadId: lead.id,
              facebookFormId: integration.facebook_form_id,
              data: extracted,
              status: 'failed',
              errorMessage: msg,
            })
          }
        }

        await updateIntegrationLastPolled(integration.id)

        if (leadsProcessed > 0) {
          await addAuditLog({
            integrationId: integration.id,
            eventType: 'poll.completed',
            details: { leadsProcessed },
          })
        }

        results.push({ integration: integration.name, leads: leadsProcessed })
      } catch (intErr) {
        const msg = intErr instanceof Error ? intErr.message : 'Integration failed'
        await addAuditLog({
          integrationId: integration.id,
          eventType: 'poll.failed',
          details: { error: msg },
        })
        results.push({ integration: integration.name, leads: 0 })
      }
    }

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

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getUser(userId: string) {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export async function getConnection(userId: string, service: 'facebook' | 'google') {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', userId)
    .eq('service', service)
    .single()
  if (error) return null
  return data
}

export async function saveConnection(params: {
  userId: string
  service: 'facebook' | 'google'
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}) {
  const existing = await getConnection(params.userId, params.service)
  if (existing) {
    const { error } = await supabase
      .from('connections')
      .update({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
        expires_at: params.expiresAt,
        metadata: params.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await supabase
    .from('connections')
    .insert({
      user_id: params.userId,
      service: params.service,
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
      expires_at: params.expiresAt,
      metadata: params.metadata,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getIntegrations(userId: string) {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getIntegration(id: string) {
  const { data, error } = await supabase
    .from('integrations')
    .select('*, facebook_connection:facebook_connection_id(*), google_connection:google_connection_id(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getActiveIntegrations() {
  const { data, error } = await supabase
    .from('integrations')
    .select('*, facebook_connection:facebook_connection_id(*), google_connection:google_connection_id(*)')
    .eq('is_active', true)
  if (error) throw error
  return data
}

export async function isLeadProcessed(integrationId: string, facebookLeadId: string) {
  const { data, error } = await supabase
    .from('processed_leads')
    .select('id')
    .eq('integration_id', integrationId)
    .eq('facebook_lead_id', facebookLeadId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function markLeadProcessed(params: {
  integrationId: string
  facebookLeadId: string
  facebookFormId: string
  data: Record<string, unknown>
  sheetRowId?: string
  status: 'processed' | 'failed' | 'skipped'
  errorMessage?: string
}) {
  const { error } = await supabase
    .from('processed_leads')
    .insert({
      integration_id: params.integrationId,
      facebook_lead_id: params.facebookLeadId,
      facebook_form_id: params.facebookFormId,
      data: params.data,
      sheet_row_id: params.sheetRowId,
      status: params.status,
      error_message: params.errorMessage,
    })
  if (error) throw error
}

export async function addAuditLog(params: {
  integrationId: string
  eventType: string
  details: Record<string, unknown>
}) {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      integration_id: params.integrationId,
      event_type: params.eventType,
      details: params.details,
    })
  if (error) throw error
}

export async function updateIntegrationLastPolled(integrationId: string) {
  const { error } = await supabase
    .from('integrations')
    .update({ last_polled_at: new Date().toISOString() })
    .eq('id', integrationId)
  if (error) throw error
}

export async function deleteIntegration(integrationId: string) {
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', integrationId)
  if (error) throw error
}

// ── Batch operations for poll-leads performance ──

/**
 * Check which leads have already been processed in a single query.
 * Returns a Set of facebook_lead_ids that are already in the database.
 */
export async function batchCheckProcessedLeads(
  integrationId: string,
  facebookLeadIds: string[]
): Promise<Set<string>> {
  if (facebookLeadIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('processed_leads')
    .select('facebook_lead_id')
    .eq('integration_id', integrationId)
    .in('facebook_lead_id', facebookLeadIds)
  if (error) throw error
  return new Set((data || []).map(d => d.facebook_lead_id))
}

/**
 * Mark multiple leads as processed/failed in a single insert.
 * Uses upsert with ignoreDuplicates to safely handle race conditions
 * where the same lead might be processed twice (UNIQUE constraint on
 * facebook_lead_id + integration_id prevents actual duplicates).
 */
export async function batchMarkLeadsProcessed(leads: Array<{
  integrationId: string
  facebookLeadId: string
  facebookFormId: string
  data: Record<string, unknown>
  sheetRowId?: string
  status: 'processed' | 'failed' | 'skipped'
  errorMessage?: string
}>) {
  if (leads.length === 0) return
  const rows = leads.map(l => ({
    integration_id: l.integrationId,
    facebook_lead_id: l.facebookLeadId,
    facebook_form_id: l.facebookFormId,
    data: l.data,
    sheet_row_id: l.sheetRowId,
    status: l.status,
    error_message: l.errorMessage,
  }))
  const { error } = await supabase
    .from('processed_leads')
    .upsert(rows, { onConflict: 'facebook_lead_id,integration_id', ignoreDuplicates: true })
  if (error) throw error
}

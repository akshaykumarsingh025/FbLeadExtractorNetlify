import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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

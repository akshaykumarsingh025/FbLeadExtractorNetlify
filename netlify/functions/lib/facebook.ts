import { supabase } from './supabase.js'

const FB_GRAPH_URL = 'https://graph.facebook.com/v19.0'

interface FacebookPage {
  id: string
  name: string
}

interface FacebookForm {
  id: string
  name: string
}

interface FacebookLead {
  id: string
  created_time: string
  field_data: Array<{
    name: string
    values: string[]
  }>
}

interface FacebookConnection {
  id: string
  access_token: string
  expires_at?: string | null
}

/**
 * Ensure we always call Facebook with a valid token, refreshing proactively
 * before expiry. Facebook long-lived user tokens last ~60 days and can be
 * renewed via the same fb_exchange_token grant — so once the user connects,
 * the connection stays alive indefinitely (including across code pushes)
 * without requiring a manual re-login.
 */
export async function ensureFacebookToken(connection: FacebookConnection): Promise<string> {
  const token = connection.access_token
  const expiresAt = connection.expires_at

  // No expiry known OR still comfortably valid (with a 1-hour safety margin)?
  const SAFE_MS = 60 * 60 * 1000
  if (!expiresAt || new Date(expiresAt).getTime() - Date.now() > SAFE_MS) {
    return token
  }

  // Token is close to expiry — renew it.
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.FACEBOOK_APP_ID || '',
    client_secret: process.env.FACEBOOK_APP_SECRET || '',
    fb_exchange_token: token,
  })

  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`)
  if (res.ok) {
    const data = await res.json()
    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined
    await supabase
      .from('connections')
      .update({
        access_token: data.access_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
    return data.access_token
  }

  // If renewal fails (e.g. token already invalid), fall back to the stored
  // token — the API call will surface the real error if it has expired.
  return token
}

export async function fetchUserPages(accessToken: string): Promise<FacebookPage[]> {
  const url = `${FB_GRAPH_URL}/me/accounts?access_token=${accessToken}&fields=id,name,access_token`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error: ${err.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return data.data || []
}

export async function fetchPageForms(pageId: string, pageAccessToken: string): Promise<FacebookForm[]> {
  const url = `${FB_GRAPH_URL}/${pageId}/leadgen_forms?access_token=${pageAccessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error: ${err.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return data.data || []
}

export async function fetchLeads(
  formId: string,
  pageAccessToken: string,
  since?: string
): Promise<FacebookLead[]> {
  let url = `${FB_GRAPH_URL}/${formId}/leads?access_token=${pageAccessToken}&fields=id,created_time,field_data`
  if (since) {
    url += `&since=${since}`
  }
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error: ${err.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return data.data || []
}

export function extractLeadFields(lead: FacebookLead): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const field of lead.field_data || []) {
    fields[field.name] = field.values?.join(', ') || ''
  }
  return fields
}

export async function fetchFormStructure(
  formId: string,
  pageAccessToken: string
): Promise<{ id: string; name: string; questions: Array<{ key: string; label: string }> }> {
  const url = `${FB_GRAPH_URL}/${formId}?access_token=${pageAccessToken}&fields=id,name,questions`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error: ${err.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return {
    id: data.id,
    name: data.name,
    questions: (data.questions || []).map((q: { key: string; label: string }) => ({
      key: q.key,
      label: q.label,
    })),
  }
}

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

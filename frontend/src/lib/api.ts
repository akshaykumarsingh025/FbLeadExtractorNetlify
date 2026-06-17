const API_BASE = '/api'

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json()
}

export function getOAuthUrl(service: 'facebook' | 'google', userId: string) {
  return `${API_BASE}/oauth-${service}?userId=${encodeURIComponent(userId)}`
}

export function getPages(userId: string) {
  return fetchApi(`/list-pages?userId=${encodeURIComponent(userId)}`)
}

export function getForms(userId: string, pageId: string) {
  return fetchApi(`/list-forms?userId=${encodeURIComponent(userId)}&pageId=${encodeURIComponent(pageId)}`)
}

export function getFormFields(userId: string, formId: string) {
  return fetchApi(`/get-form-fields?userId=${encodeURIComponent(userId)}&formId=${encodeURIComponent(formId)}`)
}

export function getSpreadsheets(userId: string) {
  return fetchApi(`/list-spreadsheets?userId=${encodeURIComponent(userId)}`)
}

export function getWorksheets(userId: string, sheetId: string) {
  return fetchApi(`/list-worksheets?userId=${encodeURIComponent(userId)}&sheetId=${encodeURIComponent(sheetId)}`)
}

export function getSheetHeaders(userId: string, sheetId: string, worksheet: string) {
  return fetchApi(`/get-sheet-headers?userId=${encodeURIComponent(userId)}&sheetId=${encodeURIComponent(sheetId)}&worksheet=${encodeURIComponent(worksheet)}`)
}

export function getIntegrations(userId: string) {
  return fetchApi(`/integrations?userId=${encodeURIComponent(userId)}`)
}

export function createIntegration(userId: string, data: Record<string, unknown>) {
  return fetchApi(`/integrations?userId=${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ userId, ...data }),
  })
}

export function updateIntegration(data: Record<string, unknown>) {
  return fetchApi('/integrations', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteIntegration(userId: string, id: string) {
  return fetchApi(`/integrations?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function getHistory(userId: string, integrationId?: string) {
  let path = `/get-history?userId=${encodeURIComponent(userId)}`
  if (integrationId) path += `&integrationId=${encodeURIComponent(integrationId)}`
  return fetchApi(path)
}

export function triggerPoll() {
  return fetchApi('/poll-leads', { method: 'POST' })
}

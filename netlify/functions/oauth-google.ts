import type { Handler, HandlerEvent } from '@netlify/functions'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  if (!userId) {
    return { statusCode: 400, body: 'Missing userId' }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = `${process.env.URL || 'http://localhost:8888'}/api/oauth-callback`

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    state: JSON.stringify({ userId, service: 'google' }),
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  })

  return {
    statusCode: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    },
  }
}

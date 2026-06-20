import type { Handler, HandlerEvent } from '@netlify/functions'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  if (!userId) {
    return { statusCode: 400, body: 'Missing userId' }
  }

  const clientId = process.env.FACEBOOK_APP_ID
  const redirectUri = `${process.env.URL || 'http://localhost:8888'}/api/oauth-callback`

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    state: JSON.stringify({ userId, service: 'facebook' }),
    scope: 'pages_show_list,pages_read_engagement,pages_manage_ads,leads_retrieval,pages_read_user_content',
    response_type: 'code',
  })

  return {
    statusCode: 302,
    headers: {
      Location: `https://www.facebook.com/v19.0/dialog/oauth?${params}`,
    },
  }
}

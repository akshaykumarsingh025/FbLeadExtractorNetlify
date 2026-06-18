import type { Handler, HandlerEvent } from '@netlify/functions'
import { saveConnection } from './lib/supabase.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const { code, state, error } = event.queryStringParameters || {}

  if (error) {
    return { statusCode: 400, body: `Auth error: ${error}` }
  }

  if (!code || !state) {
    return { statusCode: 400, body: 'Missing code or state' }
  }

  let stateData: { userId: string; service: string }
  try {
    stateData = JSON.parse(state)
  } catch {
    return { statusCode: 400, body: 'Invalid state' }
  }

  const { userId, service } = stateData
  const redirectUri = `${process.env.URL || 'http://localhost:8888'}/api/oauth-callback`

  try {
    let tokenData: {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    if (service === 'facebook') {
      const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        redirect_uri: redirectUri,
        code,
      })
      const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Token exchange failed')
      }
      tokenData = await res.json()
    } else {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      })
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error_description || 'Token exchange failed')
      }
      tokenData = await res.json()
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined

    await saveConnection({
      userId,
      service: service as 'facebook' | 'google',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    })

    const clientUrl = process.env.URL || 'http://localhost:8888'
    return {
      statusCode: 302,
      headers: { Location: `${clientUrl}/?auth=success&service=${service}` },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth failed'
    return { statusCode: 500, body: message }
  }
}

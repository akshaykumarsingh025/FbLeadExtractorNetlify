import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOAuthUrl } from '../lib/api'
import { Zap, ArrowRight, CheckCircle } from 'lucide-react'

interface Props {
  userId: string
}

export default function Home({ userId }: Props) {
  const navigate = useNavigate()
  const [fbConnected, setFbConnected] = useState(false)
  const [gsConnected, setGsConnected] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success') {
      const service = params.get('service')
      if (service === 'facebook') setFbConnected(true)
      if (service === 'google') setGsConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
    checkConnections()
  }, [])

  async function checkConnections() {
    setChecking(true)
    try {
      const [fbRes, gsRes] = await Promise.all([
        fetch(`/api/list-pages?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/list-spreadsheets?userId=${encodeURIComponent(userId)}`),
      ])
      if (fbRes.ok) setFbConnected(true)
      if (gsRes.ok) setGsConnected(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pt-20 px-4">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 mb-4">
          <Zap className="w-10 h-10 text-amber-500" />
          <h1 className="text-4xl font-bold text-slate-800">LeadSync</h1>
        </div>
        <p className="text-lg text-slate-500">
          Automatically send Facebook Lead Ads data to Google Sheets
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div className={`border-2 rounded-xl p-5 flex items-center justify-between ${fbConnected ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg">f</div>
            <div>
              <div className="font-semibold text-slate-700">Facebook Lead Ads</div>
              <div className="text-sm text-slate-400">Connect your Facebook pages</div>
            </div>
          </div>
          {fbConnected ? (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4" /> Connected</span>
          ) : (
            <a href={getOAuthUrl('facebook', userId)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Connect</a>
          )}
        </div>

        <div className={`border-2 rounded-xl p-5 flex items-center justify-between ${gsConnected ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-lg">G</div>
            <div>
              <div className="font-semibold text-slate-700">Google Sheets</div>
              <div className="text-sm text-slate-400">Connect your Google account</div>
            </div>
          </div>
          {gsConnected ? (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4" /> Connected</span>
          ) : (
            <a href={getOAuthUrl('google', userId)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Connect</a>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        disabled={!fbConnected || !gsConnected}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Go to Dashboard <ArrowRight className="w-5 h-5" />
      </button>

      {(!fbConnected || !gsConnected) && (
        <p className="text-center text-sm text-slate-400 mt-3">Connect both services to continue</p>
      )}
    </div>
  )
}

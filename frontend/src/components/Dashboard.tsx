import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getIntegrations, deleteIntegration, triggerPoll } from '../lib/api'
import { Zap, Plus, Trash2, History, RefreshCw } from 'lucide-react'

interface Props {
  userId: string
}

interface Integration {
  id: string
  name: string
  is_active: boolean
  last_polled_at: string | null
  created_at: string
  facebook_page_id: string
  facebook_form_id: string
  google_sheet_id: string
  google_worksheet_name: string
  field_mappings: Array<{ facebookField: string; sheetColumn: string }>
}

export default function Dashboard({ userId }: Props) {
  const navigate = useNavigate()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await getIntegrations(userId)
      setIntegrations(data)
    } catch {
      setIntegrations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncMessage('')
    try {
      const result = await triggerPoll()
      const summary = (result.results || [])
        .map((r: { integration: string; processed?: number; failed?: number; error?: string }) =>
          r.error ? `${r.integration}: failed` : `${r.integration}: ${r.processed || 0} new`
        )
      setSyncMessage(summary.length ? summary.join(' · ') : 'No active integrations')
      load() // refresh last_polled_at
    } catch {
      setSyncMessage('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this integration?')) return
    await deleteIntegration(userId, id)
    load()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Zap className="w-7 h-7 text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-800">LeadSync</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/history')} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <History className="w-4 h-4" /> History
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || integrations.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium hover:bg-indigo-100 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button onClick={() => navigate('/new')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Integration
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="mb-4 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Last manual sync: {syncMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : integrations.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 text-slate-300">⚡</div>
          <h2 className="text-xl font-semibold text-slate-600 mb-2">No integrations yet</h2>
          <p className="text-slate-400 mb-6">Create your first Facebook to Google Sheets pipeline</p>
          <button onClick={() => navigate('/new')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700">
            Create Integration
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {integrations.map(int => (
            <div key={int.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-700">{int.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${int.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {int.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {int.field_mappings.length} fields mapped · Last polled: {int.last_polled_at ? new Date(int.last_polled_at).toLocaleString() : 'Never'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate('/history')} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50" title="View history">
                    <History className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(int.id)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

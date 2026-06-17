import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHistory, getIntegrations, triggerPoll } from '../lib/api'
import { ArrowLeft, Clock, CheckCircle, XCircle, SkipForward, RefreshCw } from 'lucide-react'

interface Props {
  userId: string
}

interface LogEntry {
  id: string
  event_type: string
  details: Record<string, unknown>
  created_at: string
  integrations: { name: string }
}

interface Integration {
  id: string
  name: string
}

export default function History({ userId }: Props) {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    getIntegrations(userId).then(setIntegrations).catch(() => {})
    loadLogs()
  }, [])

  async function loadLogs(integrationId?: string) {
    setLoading(true)
    try {
      const data = await getHistory(userId, integrationId)
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSyncAndRefresh() {
    setSyncing(true)
    try {
      await triggerPoll()
    } catch {}
    finally {
      setSyncing(false)
      loadLogs(filter || undefined)
    }
  }

  function handleFilterChange(id: string) {
    setFilter(id)
    loadLogs(id || undefined)
  }

  function getIcon(type: string) {
    if (type.includes('created')) return <CheckCircle className="w-4 h-4 text-indigo-500" />
    if (type.includes('completed')) return <CheckCircle className="w-4 h-4 text-green-500" />
    if (type.includes('failed')) return <XCircle className="w-4 h-4 text-red-500" />
    if (type.includes('skipped')) return <SkipForward className="w-4 h-4 text-slate-400" />
    return <Clock className="w-4 h-4 text-slate-400" />
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Activity History</h1>
        <button
          onClick={handleSyncAndRefresh}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync & Refresh'}
        </button>
      </div>

      <div className="mb-6">
        <select value={filter} onChange={e => handleFilterChange(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">All integrations</option>
          {integrations.map(int => (
            <option key={int.id} value={int.id}>{int.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No activity yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3">
              <div className="mt-0.5">{getIcon(log.event_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">
                  {log.event_type.replace(/\./g, ' · ')}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {log.integrations?.name || 'Unknown'} · {new Date(log.created_at).toLocaleString()}
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <div className="text-xs text-slate-400 mt-1">
                    {JSON.stringify(log.details)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

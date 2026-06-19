import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPages, getForms, getFormFields, getSpreadsheets, getWorksheets, getSheetHeaders, createIntegration, createSpreadsheet } from '../lib/api'
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react'

interface Props {
  userId: string
}

interface Page { id: string; name: string }
interface Form { id: string; name: string }
interface Spreadsheet { id: string; name: string }
interface FormField { key: string; label: string }
interface Mapping { facebookField: string; sheetColumn: string }

type Step = 'facebook' | 'google' | 'mapping' | 'confirm'

export default function NewIntegration({ userId }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('facebook')
  const [name, setName] = useState('')

  const [pages, setPages] = useState<Page[]>([])
  const [selectedPage, setSelectedPage] = useState('')
  const [forms, setForms] = useState<Form[]>([])
  const [selectedForm, setSelectedForm] = useState('')

  const [sheets, setSheets] = useState<Spreadsheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [worksheets, setWorksheets] = useState<string[]>([])
  const [selectedWorksheet, setSelectedWorksheet] = useState('Sheet1')

  const [formFields, setFormFields] = useState<FormField[]>([])
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [saving, setSaving] = useState(false)

  const [sheetMode, setSheetMode] = useState<'existing' | 'new'>('existing')
  const [newSheetName, setNewSheetName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getPages(userId).then(setPages).catch(() => {})
    getSpreadsheets(userId).then(setSheets).catch(() => {})
  }, [])

  async function onPageChange(pageId: string) {
    setSelectedPage(pageId)
    setSelectedForm('')
    setFormFields([])
    if (pageId) {
      const f = await getForms(userId, pageId)
      setForms(f)
    }
  }

  async function onFormChange(formId: string) {
    setSelectedForm(formId)
    if (formId) {
      const f = await getFormFields(userId, formId)
      setFormFields(f.questions || [])
      setNewSheetName(f.name || 'Lead Data')
    }
  }

  async function onSheetChange(sheetId: string) {
    setSelectedSheet(sheetId)
    setSelectedWorksheet('Sheet1')
    setSheetHeaders([])
    if (sheetId) {
      const ws = await getWorksheets(userId, sheetId)
      setWorksheets(ws)
    }
  }

  async function onWorksheetChange(ws: string) {
    setSelectedWorksheet(ws)
    if (selectedSheet && ws) {
      const headers = await getSheetHeaders(userId, selectedSheet, ws)
      setSheetHeaders(headers || [])
      setMappings((headers || []).map((h: string) => ({ facebookField: '', sheetColumn: h })))
    }
  }

  function updateMapping(index: number, facebookField: string) {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, facebookField } : m))
  }

  async function handleCreateSheet() {
    if (!newSheetName.trim() || formFields.length === 0) return
    setCreating(true)
    try {
      const headers = formFields.map(f => f.label)
      const sheet = await createSpreadsheet(userId, newSheetName.trim(), headers)
      const newSheet = { id: sheet.id, name: sheet.name || newSheetName }
      setSheets(prev => [newSheet, ...prev])
      setSelectedSheet(sheet.id)
      setWorksheets(['Sheet1'])
      setSelectedWorksheet('Sheet1')
      setSheetHeaders(headers)
      setMappings(headers.map((h, i) => ({
        facebookField: formFields[i]?.key || '',
        sheetColumn: h,
      })))
      setSheetMode('existing')
    } catch {
      alert('Failed to create spreadsheet')
    } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await createIntegration(userId, {
        name: name || `${formFields.find(f => f.key === mappings.find(m => m.facebookField)?.facebookField)?.label || 'Leads'} → ${selectedWorksheet}`,
        facebookPageId: selectedPage,
        facebookFormId: selectedForm,
        googleSheetId: selectedSheet,
        googleWorksheetName: selectedWorksheet,
        fieldMappings: mappings.filter(m => m.facebookField),
      })
      navigate('/dashboard')
    } catch {
      alert('Failed to save integration')
    } finally {
      setSaving(false)
    }
  }

  const googleStepDone = !!selectedSheet && !!selectedWorksheet
  const steps = [
    { key: 'facebook', label: 'Facebook', done: !!selectedForm },
    { key: 'google', label: 'Google Sheets', done: googleStepDone },
    { key: 'mapping', label: 'Field Mapping', done: mappings.some(m => m.facebookField) },
    { key: 'confirm', label: 'Confirm', done: false },
  ]

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex gap-1 mb-8">
        {steps.map(s => (
          <div key={s.key} className={`flex-1 h-2 rounded-full ${s.done ? 'bg-indigo-500' : 'bg-slate-200'}`} />
        ))}
      </div>

      {step === 'facebook' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Select Facebook Form</h2>
          <p className="text-sm text-slate-400 mb-6">Choose the page and lead form to pull data from</p>

          <label className="block text-sm font-medium text-slate-600 mb-1">Facebook Page</label>
          <select value={selectedPage} onChange={e => onPageChange(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-4">
            <option value="">Select a page...</option>
            {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {selectedPage && (
            <>
              <label className="block text-sm font-medium text-slate-600 mb-1">Lead Form</label>
              <select value={selectedForm} onChange={e => onFormChange(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-6">
                <option value="">Select a form...</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </>
          )}

          <div className="flex justify-end">
            <button onClick={() => setStep('google')} disabled={!selectedForm} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-40">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'google' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Select Google Sheet</h2>
          <p className="text-sm text-slate-400 mb-6">Choose an existing sheet or create a new one with matching columns</p>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setSheetMode('existing')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border ${sheetMode === 'existing' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              Use Existing Sheet
            </button>
            <button
              onClick={() => setSheetMode('new')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border ${sheetMode === 'new' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              <span className="inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Create New Sheet</span>
            </button>
          </div>

          {sheetMode === 'existing' && (
            <>
              <label className="block text-sm font-medium text-slate-600 mb-1">Spreadsheet</label>
              <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-4">
                <option value="">Select a spreadsheet...</option>
                {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              {selectedSheet && (
                <>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Worksheet</label>
                  <select value={selectedWorksheet} onChange={e => onWorksheetChange(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-6">
                    {worksheets.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </>
              )}
            </>
          )}

          {sheetMode === 'new' && (
            <>
              <label className="block text-sm font-medium text-slate-600 mb-1">Sheet Name</label>
              <input
                value={newSheetName}
                onChange={e => setNewSheetName(e.target.value)}
                placeholder="e.g. My Lead Data"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-4"
              />

              {formFields.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-600 mb-2">Columns will be auto-created from your form fields:</label>
                  <div className="flex flex-wrap gap-2">
                    {formFields.map(f => (
                      <span key={f.key} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium">{f.label}</span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreateSheet}
                disabled={creating || !newSheetName.trim() || formFields.length === 0}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> {creating ? 'Creating...' : 'Create Sheet & Continue'}
              </button>
            </>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep('facebook')} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600">Back</button>
            {sheetMode === 'existing' && (
              <button onClick={() => setStep('mapping')} disabled={!selectedWorksheet} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-40">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Map Fields</h2>
          <p className="text-sm text-slate-400 mb-6">Map Facebook form fields to Google Sheet columns</p>

          <div className="space-y-3">
            {sheetHeaders.map((header, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1/3 text-sm font-medium text-slate-600">{header}</div>
                <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                <select
                  value={mappings[i]?.facebookField || ''}
                  onChange={e => updateMapping(i, e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- skip --</option>
                  {formFields.map(f => (
                    <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {sheetHeaders.length === 0 && (
            <p className="text-center text-slate-400 py-8">No headers found. Make sure your sheet has column headers in row 1.</p>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep('google')} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600">Back</button>
            <button onClick={() => setStep('confirm')} disabled={!mappings.some(m => m.facebookField)} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-40">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Review & Create</h2>
          <p className="text-sm text-slate-400 mb-6">Confirm your integration settings</p>

          <div className="space-y-3 mb-6">
            <label className="block text-sm font-medium text-slate-600">Integration Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`${selectedForm} → ${selectedWorksheet}`}
              className="w-full border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2 mb-6">
            <div><span className="font-medium text-slate-600">Form:</span> <span className="text-slate-500">{forms.find(f => f.id === selectedForm)?.name}</span></div>
            <div><span className="font-medium text-slate-600">Sheet:</span> <span className="text-slate-500">{sheets.find(s => s.id === selectedSheet)?.name} → {selectedWorksheet}</span></div>
            <div><span className="font-medium text-slate-600">Mapped fields:</span> <span className="text-slate-500">{mappings.filter(m => m.facebookField).length}</span></div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600">Back</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-40">
              <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Create Integration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

-- Facebook Leads Extractor Schema

-- Stores OAuth connections to Facebook and Google
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('facebook', 'google')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stores integration configurations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  facebook_page_id TEXT NOT NULL,
  facebook_form_id TEXT NOT NULL,
  facebook_connection_id UUID REFERENCES connections(id),
  google_sheet_id TEXT NOT NULL,
  google_worksheet_name TEXT DEFAULT 'Sheet1',
  google_connection_id UUID REFERENCES connections(id),
  field_mappings JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stores processed leads (deduplication)
CREATE TABLE processed_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  facebook_lead_id TEXT NOT NULL,
  facebook_form_id TEXT NOT NULL,
  data JSONB,
  sheet_row_id TEXT,
  status TEXT DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'skipped')),
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(facebook_lead_id, integration_id)
);

-- Audit log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX idx_processed_leads_fbid ON processed_leads(facebook_lead_id);
CREATE INDEX idx_integrations_user ON integrations(user_id);
CREATE INDEX idx_audit_logs_integration ON audit_logs(integration_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

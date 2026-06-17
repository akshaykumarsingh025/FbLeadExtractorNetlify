import { google } from 'googleapis'

export function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.sheets({ version: 'v4', auth })
}

export async function getSpreadsheets(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name)',
    orderBy: 'modifiedByMeTime desc',
    pageSize: 50,
  })
  return res.data.files || []
}

export async function getWorksheets(accessToken: string, spreadsheetId: string) {
  const sheets = getSheetsClient(accessToken)
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })
  return (res.data.sheets || []).map(s => s.properties?.title).filter(Boolean) as string[]
}

export async function getSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  worksheetName: string
): Promise<string[]> {
  const sheets = getSheetsClient(accessToken)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!1:1`,
  })
  return res.data.values?.[0] || []
}

export async function appendRow(
  accessToken: string,
  spreadsheetId: string,
  worksheetName: string,
  values: string[]
) {
  const sheets = getSheetsClient(accessToken)
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${worksheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [values],
    },
  })
  return res.data
}

export async function createSpreadsheet(
  accessToken: string,
  title: string,
  headers: string[]
) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{
        properties: { title: 'Sheet1' },
        data: [{
          rowData: [{
            values: headers.map(h => ({ userEnteredValue: { stringValue: h } })),
          }],
        }],
      }],
    },
  })
  return res.data
}

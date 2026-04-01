// apiClient.js — thin fetch wrapper; uses Vite proxy so no base URL needed in dev

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'include', // needed for session cookie on OAuth redirect
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const err = new Error('Cannot reach server')
    err.status = 0
    throw err
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    err.status = res.status
    throw err
  }
  return data
}

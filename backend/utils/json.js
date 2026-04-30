function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

module.exports = { safeParseJSON }

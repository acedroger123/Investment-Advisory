require("dotenv").config()

const express = require("express")
const cors = require("cors")
const session = require("express-session")
const PgSession = require("connect-pg-simple")(session)
const { Pool } = require("pg")
const bcrypt = require("bcrypt")
const path = require("path")
const crypto = require("crypto")
const nodemailer = require("nodemailer")
const axios = require('axios')
const multer = require("multer")
const pdfParse = require('pdf-parse')
const { google } = require('googleapis')
// Replace your old yahooFinance line with these two
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express()

/* ---------- DATABASE ---------- */
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "SignUp_SignIn_DB",
  password: "root",
  port: 5432
})

/* ---------- CORS ---------- */
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}))

/* ---------- SESSION ---------- */
app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60
  }),
  name: "ai_wealth_sid",
  secret: process.env.SESSION_SECRET || "investment_secret_key",
  resave: true,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 Days
  }
}))

/* ---------- PORTFOLIO ANALYSIS API PROXY ---------- */
/* Keep proxy before express.json() so the raw body stream is forwarded intact */
app.use('/pa-api', (req, res, next) => {
  if (!req.session || !req.session.user_id) {
    return res.status(401).json({ message: "Unauthorized" })
  }
  const userId = String(req.session.user_id)
  req.headers['x-user-id'] = userId

  // Fallback for environments where proxy header hooks are not applied.
  if (!req.url.includes('user_id=')) {
    const separator = req.url.includes('?') ? '&' : '?'
    req.url = `${req.url}${separator}user_id=${encodeURIComponent(userId)}`
  }
  next()
})

app.use('/pa-api', createProxyMiddleware({
  target: 'http://localhost:8005',
  changeOrigin: true,
  pathRewrite: { '^/': '/api/' },
  onProxyReq: (proxyReq, req) => {
    if (req.session?.user_id) {
      proxyReq.setHeader('x-user-id', String(req.session.user_id))
    }
  },
  onError: (err, req, res) => {
    console.error('Portfolio API Proxy Error:', err.message)
    res.status(502).json({
      error: 'Portfolio Analysis Engine is not running',
      detail: 'Start the FastAPI server: uvicorn portfolio_app:app --port 8005'
    })
  }
}))

app.use(express.json())

/* ---------- STATIC FILES ---------- */
app.use(express.static(path.join(__dirname, "public")))

/* ---------- MAILER ---------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ---------- MULTER CONFIG ---------- */
const upload = multer({ storage: multer.memoryStorage() })

/* ---------- AUTH VALIDATION HELPERS ---------- */
const NAME_REGEX = /^[A-Za-z]+(?:[ '.-][A-Za-z]+)*$/
const EMAIL_REGEX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const PASSWORD_ALLOWED_SPECIALS = "!@#$%^&*"
const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*]+$/

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase()
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ")
}

function validateName(name) {
  if (!name) return "Name is required"
  if (name.length < 3 || name.length > 50) {
    return "Name must be between 3 and 50 characters"
  }
  if (!NAME_REGEX.test(name)) {
    return "Name can only include letters, spaces, apostrophes, periods, and hyphens"
  }
  return null
}

function validateEmail(email) {
  if (!email) return "Email is required"
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return "Please enter a valid email address"
  }
  return null
}

function validatePassword(password) {
  const value = String(password || "")

  if (value.length < 8 || value.length > 64) {
    return "Password must be 8 to 64 characters long"
  }

  if (!PASSWORD_ALLOWED_REGEX.test(value)) {
    return `Password can only include letters, numbers, and these special characters: ${PASSWORD_ALLOWED_SPECIALS}`
  }

  const hasRequiredMix =
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[!@#$%^&*]/.test(value)

  if (!hasRequiredMix) {
    return `Password must include uppercase, lowercase, a number, and a special character (${PASSWORD_ALLOWED_SPECIALS})`
  }

  return null
}

const INCOME_RANGE_TO_MONTHLY_INR = {
  1: 20000,
  2: 50000,
  3: 100000,
  4: 150000
}

const SAVINGS_BUCKET_TO_RATIO = {
  1: 0.08,
  2: 0.15,
  3: 0.25,
  4: 0.35
}

function annualIncomeFromRange(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0

  if (numeric <= 4) {
    const monthly = INCOME_RANGE_TO_MONTHLY_INR[Math.round(numeric)] || INCOME_RANGE_TO_MONTHLY_INR[1]
    return monthly * 12
  }

  return numeric
}

function savingsRatioFromBucket(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0.10

  if (numeric <= 4) {
    return SAVINGS_BUCKET_TO_RATIO[Math.round(numeric)] || 0.10
  }

  if (numeric <= 1) return numeric
  if (numeric <= 100) return numeric / 100
  return 0.10
}

function riskStyleFromLabel(value) {
  const numericRiskStyleMap = {
    1: 0.25,
    2: 0.40,
    3: 0.60,
    4: 0.90
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numericRiskStyleMap[Math.max(1, Math.min(4, Math.round(numeric)))] || 0.60
  }

  const text = String(value || "").trim().toLowerCase()
  if (text === "low") return 0.25
  if (text === "conservative") return 0.40
  if (text === "balanced" || text === "moderate") return 0.60
  if (text === "aggressive" || text === "high") return 0.90
  return 0.60
}

const ALLOWED_EXPENSE_NATURES = new Set(["Fixed", "Variable", "Discretionary"])
const EXPENSE_CATEGORY_REGEX = /^[A-Za-z0-9][A-Za-z0-9 &()'.,/-]{0,59}$/
const MAX_EXPENSE_NOTE_LENGTH = 200
const MAX_STATEMENT_SIZE_BYTES = 8 * 1024 * 1024
const BANK_STATEMENT_KEYWORDS = [
  "statement",
  "account",
  "bank",
  "debit",
  "credit",
  "balance",
  "transaction",
  "withdrawal"
]
const MONTH_LOOKUP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
}

const CREDIT_DESCRIPTION_HINT_REGEX = /\b(salary|refund|reversal|cashback|interest|deposit|credit|inward|received)\b/i
const HEADER_NOISE_REGEX = /\b(statement of account|for the period|opening balance|closing balance|available balance)\b/i

function getTodayDateOnly() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function formatDateOnly(dateObj) {
  const yyyy = dateObj.getFullYear()
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0")
  const dd = String(dateObj.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function parseYmdDate(rawValue) {
  const match = String(rawValue || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dateObj = new Date(year, month - 1, day)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null
  }

  return dateObj
}

function normalizeExpenseDate(rawValue) {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") {
    return { ok: false, error: "Expense date is required" }
  }

  let dateObj = null
  const raw = String(rawValue).trim()

  const parsedYmd = parseYmdDate(raw)
  if (parsedYmd) {
    dateObj = parsedYmd
  } else {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      dateObj = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    }
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return { ok: false, error: "Invalid expense date format" }
  }

  return {
    ok: true,
    value: formatDateOnly(dateObj),
    dateObj
  }
}

function normalizeExpenseNature(rawValue) {
  const text = String(rawValue || "").trim().toLowerCase()
  if (text === "fixed") return "Fixed"
  if (text === "variable") return "Variable"
  if (text === "discretionary") return "Discretionary"
  return null
}

function validateExpensePayload(payload) {
  const normalizedAmount = Math.round(Number(payload?.amount) * 100) / 100
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 100000000) {
    return { ok: false, error: "Amount must be a valid positive number" }
  }

  const category = String(payload?.category || "").trim()
  if (!category || !EXPENSE_CATEGORY_REGEX.test(category)) {
    return { ok: false, error: "Category contains unsupported characters" }
  }

  const normalizedDate = normalizeExpenseDate(payload?.date)
  if (!normalizedDate.ok) {
    return { ok: false, error: normalizedDate.error }
  }

  if (normalizedDate.dateObj.getTime() > getTodayDateOnly().getTime()) {
    return { ok: false, error: "Future-dated expenses are not allowed" }
  }

  const note = String(payload?.note || "").trim().replace(/\s+/g, " ")
  if (note.length > MAX_EXPENSE_NOTE_LENGTH) {
    return { ok: false, error: `Note is too long (max ${MAX_EXPENSE_NOTE_LENGTH} characters)` }
  }

  const nature = normalizeExpenseNature(payload?.nature)
  if (!nature || !ALLOWED_EXPENSE_NATURES.has(nature)) {
    return { ok: false, error: "Nature must be Fixed, Variable, or Discretionary" }
  }

  return {
    ok: true,
    value: {
      amount: normalizedAmount,
      category,
      date: normalizedDate.value,
      note,
      nature
    }
  }
}

function parseStatementTransactionDate(rawValue) {
  const text = String(rawValue || "").trim()
  if (!text) return null

  let year
  let month
  let day

  const numericMatch = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (numericMatch) {
    day = Number(numericMatch[1])
    month = Number(numericMatch[2])
    year = Number(numericMatch[3])
  } else {
    const monthNameMatch = text.match(/^(\d{2})-([A-Za-z]{3,9})-(\d{4})$/)
    if (!monthNameMatch) return null
    day = Number(monthNameMatch[1])
    month = MONTH_LOOKUP[monthNameMatch[2].toLowerCase()]
    year = Number(monthNameMatch[3])
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const dateObj = new Date(year, month - 1, day)
  if (
    Number.isNaN(dateObj.getTime()) ||
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null
  }

  return formatDateOnly(dateObj)
}

function inferMonthYearFromFileName(fileName) {
  const name = String(fileName || "").toLowerCase()
  if (!name) return null

  const yearMatch = name.match(/\b(20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])

  let month = null
  const keys = Object.keys(MONTH_LOOKUP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const regex = new RegExp(`\\b${key}\\b`, "i")
    if (regex.test(name)) {
      month = MONTH_LOOKUP[key]
      break
    }
  }

  if (!month) return null
  return {
    year,
    month,
    ym: `${year}-${String(month).padStart(2, "0")}`
  }
}

function isFutureMonthYear(year, month) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  return year > currentYear || (year === currentYear && month > currentMonth)
}

function hasLikelyBankStatementContent(text) {
  const raw = String(text || "")
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim()
  if (normalized.length < 30) return false

  let keywordHits = 0
  for (const keyword of BANK_STATEMENT_KEYWORDS) {
    if (normalized.includes(keyword)) keywordHits++
  }

  const transactionLikeRegex = /(\d{2}[/-]\d{2}[/-]\d{4}|\d{2}-[A-Za-z]{3,9}-\d{4})\s+.{1,120}?\s+[\d,]+\.\d{2}\s*(dr|cr|debit|credit)\b/gi
  const transactionLikeMatches = raw.match(transactionLikeRegex) || []
  const hasSomeTransactionPattern = transactionLikeMatches.length >= 1
  const hasManyTransactionPatterns = transactionLikeMatches.length >= 3

  if (keywordHits >= 3) return true
  if (keywordHits >= 2 && hasSomeTransactionPattern) return true
  if (hasManyTransactionPatterns) return true
  return false
}

function parseAmountToken(rawValue) {
  const numeric = Number.parseFloat(String(rawValue || "").replace(/,/g, ""))
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100) / 100
}

function parseSignedBalanceFromChunk(chunk) {
  const text = String(chunk || "").trim()
  const balanceMatch = text.match(/([\d,]+\.\d{2})\s*(Cr|Dr)\s*$/i)
  if (!balanceMatch) return null

  const amount = parseAmountToken(balanceMatch[1])
  if (!Number.isFinite(amount)) return null

  const marker = String(balanceMatch[2] || "").toLowerCase()
  return marker === "dr" ? -amount : amount
}

function normalizeTransactionDescription(chunk, dateToken) {
  return String(chunk || "")
    .replace(new RegExp(String(dateToken || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ")
    .replace(/[\d,]+\.\d{2}\s*(Cr|Dr|Debit|Credit)?/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractStatementTransactions(text) {
  const rawText = String(text || "")
  const extracted = []
  let creditSkipped = 0
  const seen = new Set()

  const addIfUnique = (tx) => {
    if (!tx || !tx.date || !Number.isFinite(tx.amount) || tx.amount <= 0) return
    const descriptionKey = String(tx.description || "")
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
    const dedupeKey = `${tx.date}|${tx.amount.toFixed(2)}|${descriptionKey}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    extracted.push(tx)
  }

  // Strategy 1: Classic inline rows with explicit Dr/Cr marker.
  const explicitRegex = /(\d{2}[/-]\d{2}[/-]\d{4}|\d{2}-[A-Za-z]{3,9}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr|Debit|Credit)\b/gi
  let explicitMatch
  while ((explicitMatch = explicitRegex.exec(rawText)) !== null) {
    const parsedDate = parseStatementTransactionDate(explicitMatch[1])
    if (!parsedDate) continue

    const amount = parseAmountToken(explicitMatch[3])
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) continue

    const marker = String(explicitMatch[4] || "").trim().toLowerCase()
    const isCredit = marker === "cr" || marker === "credit"
    if (isCredit) {
      creditSkipped++
      continue
    }

    const description = String(explicitMatch[2] || "").replace(/\s+/g, " ").trim() || "Bank transaction"
    if (HEADER_NOISE_REGEX.test(description)) continue

    addIfUnique({
      date: parsedDate,
      amount,
      description,
      strategy: "explicit_marker"
    })
  }

  // Strategy 2: Chunk-by-date parser for table-like statements using running balance delta.
  const dateRegex = /\b(\d{2}[/-]\d{2}[/-]\d{4}|\d{2}-[A-Za-z]{3,9}-\d{4})\b/gi
  const dateMatches = Array.from(rawText.matchAll(dateRegex))
  let previousBalance = null

  for (let i = 0; i < dateMatches.length; i++) {
    const current = dateMatches[i]
    const next = dateMatches[i + 1]
    const dateToken = current[1]
    const parsedDate = parseStatementTransactionDate(dateToken)
    if (!parsedDate) continue

    const start = current.index ?? 0
    const end = next ? (next.index ?? rawText.length) : rawText.length
    let chunk = rawText.slice(start, end).replace(/\s+/g, " ").trim()
    if (!chunk || chunk.length < 10) continue

    const amounts = (chunk.match(/[\d,]+\.\d{2}/g) || [])
      .map((token) => parseAmountToken(token))
      .filter((value) => Number.isFinite(value))

    if (amounts.length === 0) {
      continue
    }

    const currentBalance = parseSignedBalanceFromChunk(chunk)
    let transactionAmount = null
    if (currentBalance !== null && amounts.length >= 2) {
      transactionAmount = amounts[amounts.length - 2]
    } else {
      transactionAmount = amounts[amounts.length - 1]
    }

    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0 || transactionAmount > 100000000) {
      if (currentBalance !== null) previousBalance = currentBalance
      continue
    }

    let isCredit = null
    if (currentBalance !== null && previousBalance !== null) {
      const delta = Number((currentBalance - previousBalance).toFixed(2))
      const tolerance = Math.max(1, transactionAmount * 0.02)
      if (Math.abs(Math.abs(delta) - transactionAmount) <= tolerance) {
        isCredit = delta > 0
      }
    }

    const chunkLower = chunk.toLowerCase()
    const description = normalizeTransactionDescription(chunk, dateToken) || "Bank transaction"

    if (isCredit === null) {
      const explicitCredit = /\b(cr|credit)\b/i.test(chunkLower)
      const explicitDebit = /\b(dr|debit|withdrawal)\b/i.test(chunkLower)
      if (explicitCredit && !explicitDebit) isCredit = true
      else if (explicitDebit && !explicitCredit) isCredit = false
      else if (CREDIT_DESCRIPTION_HINT_REGEX.test(description)) isCredit = true
    }

    if (currentBalance !== null) {
      previousBalance = currentBalance
    }

    if (isCredit === true) {
      creditSkipped++
      continue
    }
    if (HEADER_NOISE_REGEX.test(description)) continue

    addIfUnique({
      date: parsedDate,
      amount: transactionAmount,
      description,
      strategy: "balance_chunk"
    })
  }

  return {
    transactions: extracted,
    skippedCredits: creditSkipped
  }
}

function classifyExpenseFromDescription(description) {
  const descUpper = String(description || "").toUpperCase()
  let category = "Other - Variable"
  let nature = "Variable"

  if (descUpper.match(/ZOMATO|SWIGGY|EATCLUB|RESTAURANT|FOOD|CAFE/)) {
    category = "Food and Groceries"; nature = "Variable"
  } else if (descUpper.match(/AMAZON|FLIPKART|MYNTRA|RETAIL|SHOPPING|DMART/)) {
    category = "Shopping"; nature = "Discretionary"
  } else if (descUpper.match(/NETFLIX|HOTSTAR|SPOTIFY|YOUTUBE|PRIME/)) {
    category = "Subscriptions"; nature = "Discretionary"
  } else if (descUpper.match(/BOOKMYSHOW|THEATRE|PVR|INOX/)) {
    category = "Entertainment"; nature = "Discretionary"
  } else if (descUpper.match(/AIRTEL|JIO|ELECTRICITY|WATER|BESCOM|INTERNET/)) {
    category = "Utilities"; nature = "Variable"
  } else if (descUpper.match(/BILL|RECHARGE/)) {
    category = "Utilities"; nature = "Variable"
  } else if (descUpper.match(/UBER|OLA|PETROL|SHELL|FUEL|METRO|RAPIDO/)) {
    category = "Transport"; nature = "Variable"
  } else if (descUpper.match(/MAKEMYTRIP|IRCTC|AIRLINES|FLIGHT|HOTEL|GOIBIBO/)) {
    category = "Travel"; nature = "Discretionary"
  } else if (descUpper.match(/RENT|SOCIETY|MAINTENANCE/)) {
    category = "Rent"; nature = "Fixed"
  } else if (descUpper.match(/EMI|LOAN|BAJAJ|HDFC LOAN|ICICI LOAN/)) {
    category = "EMI"; nature = "Fixed"
  } else if (descUpper.match(/LIC|INSURANCE|PREMIUM/)) {
    category = "Insurance"; nature = "Fixed"
  } else if (descUpper.match(/HOSPITAL|PHARMACY|MEDICAL|APOLLO|CLINIC/)) {
    category = "Medical"; nature = "Variable"
  } else if (descUpper.match(/ZOMATO.*DINING|SWIGGY.*DINE|RESTAURANT.*SIT/)) {
    category = "Dining Out"; nature = "Discretionary"
  }

  return { category, nature }
}

async function insertExpenseIfNotDuplicate({
  userId,
  amount,
  category,
  date,
  note,
  nature
}) {
  const result = await pool.query(
    `INSERT INTO expenses (user_id, amount, category, date, note, nature)
     SELECT $1::int, $2::numeric, $3::text, $4::date, $5::text, $6::text
     WHERE NOT EXISTS (
       SELECT 1
       FROM expenses
       WHERE user_id = $1
         AND date::date = $4::date
         AND ROUND(CAST(amount AS numeric), 2) = ROUND(CAST($2 AS numeric), 2)
         AND LOWER(TRIM(COALESCE(note, ''))) = LOWER(TRIM(COALESCE($5::text, '')))
      )
      RETURNING *`,
    [userId, amount, category, date, note, nature]
  )

  return result.rows[0] || null
}

/* =========================================
    AUTH ROUTES
    ========================================= */

/* Check Login Status */
app.get("/auth/check", async (req, res) => {
  if (!req.session.user_id) {
    return res.json({ logged_in: false })
  }

  try {
    const userResult = await pool.query(
      "SELECT name FROM newusers WHERE id=$1",
      [req.session.user_id]
    )

    const userName = userResult.rows[0]?.name || "User"
    const sensitiveUnlocked =
      req.session.sensitive_verified === true &&
      req.session.sensitive_verified_until &&
      Date.now() < req.session.sensitive_verified_until

    res.json({
      logged_in: true,
      name: userName,
      sensitive_unlocked: sensitiveUnlocked,
      questionnaire_completed: req.session.questionnaire_completed
    })
  } catch (err) {
    console.error("Auth Check Error:", err)
    res.json({ logged_in: false })
  }
})

/* Login */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body
    const normalizedEmail = normalizeEmail(email)

    const result = await pool.query(
      `SELECT id, password, consent_given, questionnaire_completed FROM newusers WHERE LOWER(email)=LOWER($1)`,
      [normalizedEmail]
    )

    if (!result.rows.length)
      return res.status(401).json({ message: "Invalid credentials" })

    const user = result.rows[0]
    const match = await bcrypt.compare(password, user.password)

    if (!match)
      return res.status(401).json({ message: "Invalid credentials" })

    req.session.user_id = user.id
    req.session.consent_given = user.consent_given
    req.session.questionnaire_completed = user.questionnaire_completed
    req.session.sensitive_verified = false
    req.session.sensitive_verified_until = null

    res.json({
      message: "Login successful",
      consent_given: user.consent_given,
      questionnaire_completed: user.questionnaire_completed
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Login failed" })
  }
})

/* Register */
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body
    const normalizedName = normalizeName(name)
    const normalizedEmail = normalizeEmail(email)

    const nameError = validateName(normalizedName)
    if (nameError) {
      return res.status(400).json({ message: nameError })
    }

    const emailError = validateEmail(normalizedEmail)
    if (emailError) {
      return res.status(400).json({ message: emailError })
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      return res.status(400).json({ message: passwordError })
    }

    const exists = await pool.query("SELECT id FROM newusers WHERE LOWER(email)=LOWER($1)", [normalizedEmail])

    if (exists.rows.length)
      return res.status(400).json({ message: "Email already registered" })

    const hashed = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO newusers (name, email, password, consent_given, questionnaire_completed)
       VALUES ($1, $2, $3, FALSE, FALSE)
       RETURNING id`,
      [normalizedName, normalizedEmail, hashed]
    )

    req.session.user_id = result.rows[0].id
    req.session.consent_given = false
    req.session.questionnaire_completed = false

    res.json({ message: "Registered successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Registration failed" })
  }
})

/* Logout */
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out" }))
})

/* =========================================
    PROFILE & SETTINGS ROUTES
    ========================================= */

/* Get Profile Status */
app.get("/profile/status", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `SELECT country, occupation, annual_income_range FROM newusers WHERE id=$1`,
      [req.session.user_id]
    )

    if (!result.rows.length) return res.json({ completed: false })

    const u = result.rows[0]
    const isComplete = u.country && u.occupation && u.annual_income_range

    res.json({ completed: !!isComplete })
  } catch (err) {
    res.status(500).json({ message: "Error fetching status" })
  }
})

/* Get Full Profile */
app.get("/profile/full", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `SELECT email, dob, country, occupation, annual_income_range FROM newusers WHERE id=$1`,
      [req.session.user_id]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ message: "Error fetching profile" })
  }
})

/* Update Profile */
app.post("/settings/update-profile", async (req, res) => {
  try {
    if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

    if (
      req.session.sensitive_verified !== true ||
      Date.now() > req.session.sensitive_verified_until
    ) {
      return res.status(403).json({ message: "OTP verification required" })
    }

    const { email, dob, country, occupation, annual_income_range } = req.body
    const normalizedEmail = email ? normalizeEmail(email) : null

    if (normalizedEmail) {
      const emailError = validateEmail(normalizedEmail)
      if (emailError) {
        return res.status(400).json({ message: emailError })
      }
    }

    await pool.query(
      `UPDATE newusers
       SET email=$1, dob=$2, country=$3, occupation=$4, annual_income_range=$5
       WHERE id=$6`,
      [normalizedEmail || null, dob || null, country || null, occupation || null, annual_income_range || null, req.session.user_id]
    )

    res.json({ message: "Profile updated successfully" })
  } catch (err) {
    console.error("UPDATE ERROR:", err)
    res.status(500).json({ message: "Update failed" })
  }
})

/* Request OTP for Settings */
app.post("/settings/request-otp", async (req, res) => {
  try {
    if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

    const otp = crypto.randomInt(100000, 999999).toString()

    req.session.settings_otp = otp
    req.session.settings_otp_expires = Date.now() + 5 * 60 * 1000

    const result = await pool.query("SELECT email FROM newusers WHERE id=$1", [req.session.user_id])

    await transporter.sendMail({
      to: result.rows[0].email,
      subject: "OTP to Unlock Sensitive Settings",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`
    })

    res.json({ message: "OTP sent" })
  } catch (err) {
    console.error("OTP ERROR:", err.message)
    res.status(500).json({ message: "Failed to send OTP" })
  }
})

/* Verify OTP for Settings */
app.post("/settings/verify-otp", (req, res) => {
  const { otp } = req.body

  if (!req.session.settings_otp || Date.now() > req.session.settings_otp_expires) {
    return res.status(400).json({ message: "OTP expired" })
  }

  if (otp !== req.session.settings_otp)
    return res.status(400).json({ message: "Invalid OTP" })

  delete req.session.settings_otp
  delete req.session.settings_otp_expires

  req.session.sensitive_verified = true
  req.session.sensitive_verified_until = Date.now() + 10 * 60 * 1000

  res.json({ message: "Sensitive settings unlocked" })
})

/* Manual Lock Settings */
app.post("/settings/lock", (req, res) => {
  if (req.session) {
    req.session.sensitive_verified = false
    req.session.sensitive_verified_until = null
  }
  res.json({ message: "Settings locked" })
})

/* =========================================
    NOTIFICATION ROUTES
    ========================================= */

app.get("/notifications/get", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const result = await pool.query(
    `SELECT notif_email, notif_push, notif_monthly_report FROM newusers WHERE id = $1`,
    [req.session.user_id]
  )
  res.json(result.rows[0])
})

app.post("/notifications/update", async (req, res) => {
  try {
    if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

    const { notif_email, notif_push, notif_monthly_report } = req.body

    await pool.query(
      `UPDATE newusers
       SET notif_email = $1, notif_push = $2, notif_monthly_report = $3
       WHERE id = $4`,
      [!!notif_email, !!notif_push, !!notif_monthly_report, req.session.user_id]
    )

    res.json({ message: "Notification preferences updated" })
  } catch (err) {
    console.error("NOTIFICATION UPDATE ERROR:", err)
    res.status(500).json({ message: "Failed to update notifications" })
  }
})

/* =========================================
    QUESTIONNAIRE & CONSENT ROUTES
    ========================================= */

/* Record Consent */
app.post("/consent", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    await pool.query("UPDATE newusers SET consent_given = TRUE WHERE id = $1", [req.session.user_id])
    req.session.consent_given = true
    res.json({ message: "Consent recorded" })
  } catch (err) {
    res.status(500).json({ message: "Error recording consent" })
  }
})

/* Guard Questionnaire Route */
app.get("/guard/questionnaire", (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ allowed: false })
  res.json({ allowed: true })
})

/* Submit Survey */
app.post("/survey", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const client = await pool.connect()
  let txStarted = false

  try {
    const {
      age_group, occupation, income_range, savings_percent,
      investment_experience, instruments_used_count, financial_comfort,
      loss_reaction, return_priority, volatility_comfort,
      risk_label
    } = req.body

    const toInt = (value, fallback = null) => {
      const parsed = Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : fallback
    }

    const toRiskLabelInt = (value) => {
      const numeric = toInt(value, null)
      if (numeric !== null) return Math.max(1, Math.min(4, numeric))

      const text = String(value || "").trim().toLowerCase()
      if (["low", "very low"].includes(text)) return 1
      if (["conservative", "low-medium", "low medium"].includes(text)) return 2
      if (["balanced", "moderate", "medium"].includes(text)) return 3
      if (["aggressive", "high"].includes(text)) return 4
      return null
    }

    const parsedPayload = {
      age_group: toInt(age_group),
      occupation: String(occupation || "").trim(),
      annual_income_range: toInt(income_range),
      savings_percent: toInt(savings_percent),
      investment_experience: toInt(investment_experience),
      instruments_used_count: toInt(instruments_used_count, 0),
      financial_comfort: toInt(financial_comfort),
      loss_reaction: toInt(loss_reaction),
      return_priority: toInt(return_priority),
      volatility_comfort: toInt(volatility_comfort),
      risk_label: toRiskLabelInt(risk_label)
    }

    const requiredNumericFields = [
      "age_group",
      "annual_income_range",
      "savings_percent",
      "investment_experience",
      "financial_comfort",
      "loss_reaction",
      "return_priority",
      "volatility_comfort",
      "risk_label"
    ]

    for (const key of requiredNumericFields) {
      if (!Number.isInteger(parsedPayload[key])) {
        return res.status(400).json({ message: `Invalid survey field: ${key}` })
      }
    }

    if (!parsedPayload.occupation) {
      return res.status(400).json({ message: "Invalid survey field: occupation" })
    }

    await client.query("BEGIN")
    txStarted = true

    // Try to save to questionnaire_responses table (optional - use SAVEPOINT to handle failure)
    try {
      await client.query("SAVEPOINT quest_save")
      await client.query(
        `DELETE FROM questionnaire_responses WHERE user_id = $1`,
        [req.session.user_id]
      )
      await client.query(
        `INSERT INTO questionnaire_responses
         (user_id, age_group, occupation, income_range, savings_percent,
          investment_experience, instruments_used_count, financial_comfort,
          loss_reaction, return_priority, volatility_comfort, risk_label)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          req.session.user_id,
          parsedPayload.age_group,
          parsedPayload.occupation,
          parsedPayload.annual_income_range,
          parsedPayload.savings_percent,
          parsedPayload.investment_experience,
          parsedPayload.instruments_used_count,
          parsedPayload.financial_comfort,
          parsedPayload.loss_reaction,
          parsedPayload.return_priority,
          parsedPayload.volatility_comfort,
          parsedPayload.risk_label
        ]
      )
      await client.query("RELEASE SAVEPOINT quest_save")
    } catch (questErr) {
      await client.query("ROLLBACK TO SAVEPOINT quest_save")
      console.warn("questionnaire_responses table insert skipped:", questErr.message)
    }

    await client.query(
      `UPDATE newusers 
       SET age_group=$1, occupation=$2, annual_income_range=$3, savings_percent=$4, 
           investment_experience=$5, instruments_used_count=$6, financial_comfort=$7,
           loss_reaction=$8, return_priority=$9, volatility_comfort=$10, risk_label=$11,
           questionnaire_completed=TRUE 
       WHERE id=$12`,
      [
        parsedPayload.age_group, parsedPayload.occupation, parsedPayload.annual_income_range, parsedPayload.savings_percent,
        parsedPayload.investment_experience, parsedPayload.instruments_used_count, parsedPayload.financial_comfort,
        parsedPayload.loss_reaction, parsedPayload.return_priority, parsedPayload.volatility_comfort,
        parsedPayload.risk_label,
        req.session.user_id
      ]
    )

    await client.query("COMMIT")
    txStarted = false

    req.session.questionnaire_completed = true
    res.json({ message: "Survey saved" })
  } catch (err) {
    if (txStarted) {
      try {
        await client.query("ROLLBACK")
      } catch (_) { }
    }
    console.error("SURVEY ERROR:", err)
    res.status(500).json({ message: "Error saving survey" })
  } finally {
    client.release()
  }
})

app.get("/api/user-survey-profile", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `SELECT age_group, occupation, annual_income_range, savings_percent, risk_label, questionnaire_completed
       FROM newusers
       WHERE id = $1`,
      [req.session.user_id]
    )

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" })
    }

    const user = result.rows[0]
    const annualIncome = annualIncomeFromRange(user.annual_income_range)
    const savingsRatio = savingsRatioFromBucket(user.savings_percent)

    res.json({
      questionnaire_completed: !!user.questionnaire_completed,
      age_group: user.age_group,
      occupation: user.occupation,
      annual_income_range: user.annual_income_range,
      annual_income_estimate: annualIncome,
      savings_percent: user.savings_percent,
      savings_ratio: Number(savingsRatio.toFixed(4)),
      risk_label: user.risk_label,
      goal: "Wealth",
      time_horizon: 2
    })
  } catch (err) {
    console.error("SURVEY PROFILE ERROR:", err)
    res.status(500).json({ message: "Failed to load survey profile" })
  }
})

/* =========================================
    PASSWORD RESET ROUTES
    ========================================= */

app.post("/password/request-otp", async (req, res) => {
  try {
    const { email } = req.body
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) return res.status(400).json({ message: "Email required" })
    const emailError = validateEmail(normalizedEmail)
    if (emailError) return res.status(400).json({ message: emailError })

    const result = await pool.query("SELECT id, email FROM newusers WHERE LOWER(email)=LOWER($1)", [normalizedEmail])
    if (!result.rows.length) return res.status(400).json({ message: "Email not found" })

    const accountEmail = result.rows[0].email

    const otp = crypto.randomInt(100000, 999999).toString()

    req.session.password_reset_otp = otp
    req.session.password_reset_email = accountEmail
    req.session.password_reset_expires = Date.now() + 5 * 60 * 1000

    await transporter.sendMail({
      to: accountEmail,
      subject: "Password Change OTP",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`
    })

    res.json({ message: "OTP sent" })
  } catch (err) {
    console.error("PASSWORD OTP ERROR:", err)
    res.status(500).json({ message: "Failed to send OTP" })
  }
})

app.post("/password/verify-otp", (req, res) => {
  const { otp } = req.body

  if (!req.session.password_reset_otp || Date.now() > req.session.password_reset_expires) {
    return res.status(400).json({ message: "OTP expired" })
  }

  if (otp !== req.session.password_reset_otp) {
    return res.status(400).json({ message: "Invalid OTP" })
  }

  req.session.password_reset_verified = true
  delete req.session.password_reset_otp
  delete req.session.password_reset_expires

  res.json({ message: "OTP verified" })
})

app.post("/password/change", async (req, res) => {
  try {
    if (!req.session.password_reset_verified) {
      return res.status(403).json({ message: "OTP not verified" })
    }

    const { newPassword } = req.body

    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      return res.status(400).json({ message: passwordError })
    }

    const hashed = await bcrypt.hash(newPassword, 10)

    await pool.query("UPDATE newusers SET password = $1 WHERE email = $2", [hashed, req.session.password_reset_email])

    delete req.session.password_reset_verified
    delete req.session.password_reset_email

    res.json({ message: "Password changed successfully" })
  } catch (err) {
    console.error("PASSWORD CHANGE ERROR:", err)
    res.status(500).json({ message: "Password change failed" })
  }
})

/* =========================================
    LEGACY GOALS ROUTES (PostgreSQL-based)
    These are the original goals stored in PostgreSQL.
    The new portfolio analysis goals use SQLite via FastAPI on /pa-api/goals
    ========================================= */

/* Get All Legacy Goals */
app.get("/api/goals", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      "SELECT * FROM user_goals WHERE user_id = $1 ORDER BY id DESC",
      [req.session.user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error("Fetch Goals Error:", err)
    res.status(500).json({ message: "Database error" })
  }
})

/* Add New Goal */
app.post("/api/goals", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const { name, target, duration, priority } = req.body

  try {
    const result = await pool.query(
      `INSERT INTO user_goals (user_id, name, target_amount, duration_months, priority)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.session.user_id, name, target, duration, priority]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error("Add Goal Error:", err)
    res.status(500).json({ message: "Failed to save goal" })
  }
})

/* Delete Goal */
app.delete("/api/goals/:id", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    await pool.query(
      "DELETE FROM user_goals WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.user_id]
    )
    res.json({ message: "Goal deleted" })
  } catch (err) {
    console.error("Delete Goal Error:", err)
    res.status(500).json({ message: "Failed to delete goal" })
  }
})

/* =========================================
    EXPENSE ROUTES
    ========================================= */


/* Get Expense Breakdown (Monthly) */
app.get("/api/expenses/breakdown", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `WITH latest_month AS (
         SELECT DATE_TRUNC('month', MAX(date::date)) AS month_start
         FROM expenses
         WHERE user_id = $1
           AND date::date <= CURRENT_DATE
       )
       SELECT e.category, SUM(e.amount) AS total
       FROM expenses e
       CROSS JOIN latest_month lm
       WHERE e.user_id = $1
         AND e.date::date <= CURRENT_DATE
         AND lm.month_start IS NOT NULL
         AND DATE_TRUNC('month', e.date::date) = lm.month_start
       GROUP BY e.category`,
      [req.session.user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error("Breakdown Error:", err)
    res.status(500).json({ message: "Database error" })
  }
})

/* Get Weekly Spending (Current Week) */
app.get("/api/expenses/weekly", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `SELECT TO_CHAR(date, 'Day') as day_name, SUM(amount) as total, EXTRACT(DOW FROM date) as day_idx
       FROM expenses 
       WHERE user_id = $1
         AND date::date >= DATE_TRUNC('week', CURRENT_DATE)::date
         AND date::date <= CURRENT_DATE
       GROUP BY day_name, day_idx
       ORDER BY day_idx`,
      [req.session.user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error("Weekly Error:", err)
    res.status(500).json({ message: "Database error" })
  }
})

/* Get All Expenses */
app.get("/api/expenses", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE user_id = $1 AND date::date <= CURRENT_DATE ORDER BY date DESC, id DESC",
      [req.session.user_id]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ message: "Database error" })
  }
})

/* Add Manual Expense */
app.post("/api/expenses", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const validation = validateExpensePayload(req.body)
  if (!validation.ok) return res.status(400).json({ message: validation.error })

  const { amount, category, date, note, nature } = validation.value

  try {
    const inserted = await insertExpenseIfNotDuplicate({
      userId: req.session.user_id,
      amount,
      category,
      date,
      note,
      nature
    })

    if (!inserted) {
      return res.status(409).json({ message: "This expense already exists" })
    }

    res.json(inserted)
  } catch (err) {
    res.status(500).json({ message: "Failed to add expense" })
  }
})

/* Get Monthly Totals (Only existing months in DB) */
app.get("/api/expenses/monthly", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'YYYY-MM') AS month,
              SUM(amount) AS total
       FROM expenses
       WHERE user_id = $1
         AND date::date <= CURRENT_DATE
       GROUP BY DATE_TRUNC('month', date::date)
       ORDER BY month`,
      [req.session.user_id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error("Monthly Expense Error:", err)
    res.status(500).json({ message: "Database error" })
  }
})

/* Update Expense */
app.put("/api/expenses/:id", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const expenseId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ message: "Invalid expense id" })
  }

  const validation = validateExpensePayload(req.body)
  if (!validation.ok) return res.status(400).json({ message: validation.error })

  const { amount, category, date, note, nature } = validation.value

  try {
    const duplicate = await pool.query(
      `SELECT id
       FROM expenses
       WHERE user_id = $1
         AND id <> $2
         AND date::date = $3::date
         AND ROUND(CAST(amount AS numeric), 2) = ROUND(CAST($4 AS numeric), 2)
         AND LOWER(TRIM(COALESCE(note, ''))) = LOWER(TRIM(COALESCE($5::text, '')))
       LIMIT 1`,
      [req.session.user_id, expenseId, date, amount, note]
    )

    if (duplicate.rows.length) {
      return res.status(409).json({ message: "Another expense with same details already exists" })
    }

    const result = await pool.query(
      `UPDATE expenses
       SET amount = $1, category = $2, date = $3, note = $4, nature = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [amount, category, date, note, nature, expenseId, req.session.user_id]
    )

    if (!result.rows.length) {
      return res.status(404).json({ message: "Expense not found" })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ message: "Failed to update expense" })
  }
})

/* Delete Expense */
app.delete("/api/expenses/:id", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const expenseId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ message: "Invalid expense id" })
  }

  try {
    const result = await pool.query(
      "DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id",
      [expenseId, req.session.user_id]
    )

    if (!result.rows.length) {
      return res.status(404).json({ message: "Expense not found" })
    }

    res.json({ message: "Expense deleted" })
  } catch (err) {
    res.status(500).json({ message: "Failed to delete expense" })
  }
})

/* Sync Emails (Simulated) */
app.get("/api/sync-emails", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const rawEmails = [
      {
        from: "alerts@hdfcbank.net",
        subject: "Transaction Alert",
        body: "Rs 1500.00 has been debited from your HDFC Bank account at AMAZON INDIA on 26-Jan-2026."
      },
      {
        from: "notifications@sbi.co.in",
        subject: "SBI Alert",
        body: "Your acct debited with INR 450.00 on 25 Jan for ZOMATO."
      }
    ]

    let foundCount = 0
    let duplicateCount = 0
    const amountRegex = /(?:Rs|INR)\.?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i
    const merchantRegex = /at\s+([A-Z\s]+)\s+on/i
    const emailDateRegex = /on\s+(\d{1,2})[-\s]([A-Za-z]{3,9})(?:[-\s](\d{4}))?/i

    for (let email of rawEmails) {
      const amountMatch = email.body.match(amountRegex)

      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''))
        const merchantMatch = email.body.match(merchantRegex)
        const merchant = merchantMatch ? merchantMatch[1].trim() : "Auto-Debit"
        const dateMatch = email.body.match(emailDateRegex)
        const now = new Date()

        let txDate = formatDateOnly(getTodayDateOnly())
        if (dateMatch) {
          const day = Number(dateMatch[1])
          const month = MONTH_LOOKUP[String(dateMatch[2] || "").toLowerCase()]
          const year = Number(dateMatch[3] || now.getFullYear())
          const candidate = new Date(year, (month || 1) - 1, day)
          if (
            Number.isFinite(day) &&
            Number.isFinite(month) &&
            Number.isFinite(year) &&
            !Number.isNaN(candidate.getTime()) &&
            candidate.getDate() === day &&
            candidate.getMonth() === month - 1 &&
            candidate.getFullYear() === year &&
            candidate.getTime() <= getTodayDateOnly().getTime()
          ) {
            txDate = formatDateOnly(candidate)
          }
        }

        let category = "Shopping"
        let nature = "Discretionary"

        if (merchant.includes("ZOMATO") || merchant.includes("SWIGGY")) {
          category = "Food and Groceries"
          nature = "Variable"
        } else if (merchant.includes("AMAZON") || merchant.includes("FLIPKART")) {
          category = "Shopping"
          nature = "Discretionary"
        } else if (merchant.includes("NETFLIX") || merchant.includes("HOTSTAR") || merchant.includes("SPOTIFY")) {
          category = "Subscriptions"
          nature = "Discretionary"
        }

        const inserted = await insertExpenseIfNotDuplicate({
          userId: req.session.user_id,
          amount,
          category,
          date: txDate,
          note: `Auto-synced: ${merchant}`,
          nature
        })

        if (inserted) foundCount++
        else duplicateCount++
      }
    }

    res.json({
      message: "Sync complete",
      found_transactions: foundCount,
      duplicates_skipped: duplicateCount
    })
  } catch (err) {
    console.error("Email Sync Error:", err)
    res.status(500).json({ message: "Failed to scan emails" })
  }
})

/* Upload PDF Statement */
app.post("/api/upload-statement", upload.single("statement"), async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })
  if (!req.file) return res.status(400).json({ message: "No file uploaded" })
  if (!String(req.file.mimetype || "").toLowerCase().includes("pdf")) {
    return res.status(400).json({ message: "Only PDF statements are supported" })
  }
  if (Number(req.file.size || 0) > MAX_STATEMENT_SIZE_BYTES) {
    return res.status(400).json({ message: "Statement is too large (max 8MB)" })
  }

  try {
    const pdfData = await pdfParse(req.file.buffer)
    const text = pdfData.text
    if (!hasLikelyBankStatementContent(text)) {
      return res.status(400).json({
        message: "Uploaded file does not appear to be a valid bank statement"
      })
    }

    const filenameMonthYear = inferMonthYearFromFileName(req.file.originalname)
    if (filenameMonthYear && isFutureMonthYear(filenameMonthYear.year, filenameMonthYear.month)) {
      return res.status(400).json({
        message: "Future month statements are not allowed"
      })
    }

    const statementHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex")
    const statementTag = `PDFHASH:${statementHash}`

    const existingUpload = await pool.query(
      `SELECT 1
       FROM expenses
       WHERE user_id = $1 AND note LIKE $2
       LIMIT 1`,
      [req.session.user_id, `${statementTag}%`]
    )

    if (existingUpload.rows.length) {
      return res.status(409).json({
        message: "This bank statement has already been uploaded",
        found_transactions: 0,
        duplicates_skipped: 0
      })
    }

    const extraction = extractStatementTransactions(text)
    const extractedTransactions = Array.isArray(extraction.transactions) ? extraction.transactions : []
    const parsedTransactions = []
    let skippedCredits = Number(extraction.skippedCredits || 0)
    let skippedInvalid = 0
    let skippedFuture = 0

    for (const tx of extractedTransactions) {
      const transactionDate = tx.date
      const txDateObj = parseYmdDate(transactionDate)
      if (!txDateObj || txDateObj.getTime() > getTodayDateOnly().getTime()) {
        skippedFuture++
        continue
      }

      const amount = Number(tx.amount)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
        skippedInvalid++
        continue
      }

      const description = String(tx.description || "Bank transaction").replace(/\s+/g, " ").trim()
      const safeDescription = description.substring(0, 80)
      const { category, nature } = classifyExpenseFromDescription(description)
      const note = `${statementTag}|PDF: ${safeDescription}`.substring(0, MAX_EXPENSE_NOTE_LENGTH)

      parsedTransactions.push({
        amount: Math.round(amount * 100) / 100,
        category,
        note,
        nature,
        date: transactionDate
      })
    }

    if (parsedTransactions.length === 0) {
      return res.status(400).json({
        message: "No valid debit transactions found in statement",
        skipped_credits: skippedCredits,
        skipped_invalid: skippedInvalid,
        skipped_future: skippedFuture
      })
    }

    const monthCounts = new Map()
    for (const tx of parsedTransactions) {
      const ym = tx.date.slice(0, 7)
      monthCounts.set(ym, (monthCounts.get(ym) || 0) + 1)
    }
    const dominantMonth = Array.from(monthCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    const currentMonth = formatDateOnly(getTodayDateOnly()).slice(0, 7)

    if (dominantMonth && dominantMonth > currentMonth) {
      return res.status(400).json({
        message: "Future month statements are not allowed"
      })
    }

    if (filenameMonthYear) {
      const hasExpectedMonth = parsedTransactions.some((tx) => tx.date.startsWith(filenameMonthYear.ym))
      if (!hasExpectedMonth) {
        return res.status(400).json({
          message: "Statement month does not match the transaction dates in the PDF"
        })
      }
    }

    let insertedCount = 0
    let duplicateCount = 0
    for (const tx of parsedTransactions) {
      const inserted = await insertExpenseIfNotDuplicate({
        userId: req.session.user_id,
        amount: tx.amount,
        category: tx.category,
        date: tx.date,
        note: tx.note,
        nature: tx.nature
      })

      if (inserted) insertedCount++
      else duplicateCount++
    }

    if (!insertedCount && duplicateCount > 0) {
      return res.status(200).json({
        message: "No new transactions were added. This statement may already be imported.",
        found_transactions: 0,
        duplicates_skipped: duplicateCount
      })
    }

    res.json({
      message: "PDF processed successfully",
      found_transactions: insertedCount,
      duplicates_skipped: duplicateCount,
      skipped_credits: skippedCredits,
      skipped_invalid: skippedInvalid,
      skipped_future: skippedFuture
    })
  } catch (err) {
    console.error("PDF Parsing Error:", err)
    res.status(500).json({ message: "Failed to parse PDF" })
  }
})

/* =========================================
    LEGACY PORTFOLIO ROUTES (YAHOO FINANCE)
    These original routes are preserved for backward compatibility.
    The new portfolio analysis system runs via FastAPI on /pa-api/*
    ========================================= */

/* Stock Search (Yahoo Finance - No API Key Needed!) */
app.get("/api/stock-search", async (req, res) => {
  console.log("\n🔍 === STOCK SEARCH (Yahoo Finance) ===")

  try {
    const query = req.query.query
    console.log("Query:", query)

    if (!query || query.trim() === "") {
      return res.status(400).json({
        error: "Search query cannot be empty"
      })
    }

    // Yahoo Finance search - completely free!
    const searchResults = await yahooFinance.search(query, {
      quotesCount: 10,
      newsCount: 0
    })

    console.log("Raw results:", searchResults.quotes?.length || 0, "found")

    // Transform to match your frontend format
    const formatted = searchResults.quotes
      .filter(q => q.symbol)
      .slice(0, 10)
      .map(quote => ({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        exchangeShortName: quote.exchange || quote.exchDisp || 'N/A',
        type: quote.quoteType || quote.typeDisp || 'Stock'
      }))

    console.log("Returning", formatted.length, "results")
    if (formatted.length > 0) {
      console.log("First result:", formatted[0].symbol, "-", formatted[0].name)
    }
    console.log("=== END STOCK SEARCH ===\n")

    res.json(formatted)

  } catch (err) {
    console.error("\nStock Search Error:", err.message)
    res.status(500).json({
      error: "Search failed",
      details: err.message
    })
  }
})

/* Get Stock Quote (Real-time price) - NEW ENDPOINT */
app.get("/api/stock-quote/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params

    const quote = await yahooFinance.quote(symbol)

    res.json({
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      previousClose: quote.regularMarketPreviousClose,
      open: quote.regularMarketOpen,
      dayHigh: quote.regularMarketDayHigh,
      dayLow: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow
    })
  } catch (err) {
    console.error("Quote Error:", err.message)
    res.status(500).json({ error: "Failed to fetch quote" })
  }
})

/* Get All Holdings */
app.get("/api/holdings", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const result = await pool.query(
      "SELECT * FROM user_holdings WHERE user_id = $1 ORDER BY added_at DESC",
      [req.session.user_id]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch holdings" })
  }
})

/* Add New Stock Holding */
app.post("/api/holdings", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  const { symbol, quantity, price } = req.body

  try {
    const result = await pool.query(
      "INSERT INTO user_holdings (user_id, symbol, quantity, purchase_price) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.session.user_id, symbol.toUpperCase(), quantity, price]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ message: "Failed to save holding" })
  }
})

/* Delete Holding */
app.delete("/api/holdings/:symbol", async (req, res) => {
  if (!req.session.user_id) return res.status(401).send()

  const { symbol } = req.params

  try {
    await pool.query(
      "DELETE FROM user_holdings WHERE user_id = $1 AND symbol = $2",
      [req.session.user_id, symbol]
    )
    res.status(200).json({ message: "Holding deleted successfully" })
  } catch (err) {
    console.error("Database error during delete:", err)
    res.status(500).json({ message: "Error deleting holding" })
  }
})

/* Dashboard Summary with Real-Time Prices */
app.get("/api/dashboard-summary", async (req, res) => {
  if (!req.session.user_id) return res.status(401).send()

  try {
    // Fetch user holdings
    const holdings = (await pool.query(
      "SELECT symbol, quantity, purchase_price FROM user_holdings WHERE user_id = $1",
      [req.session.user_id]
    )).rows

    let totalPortfolioValue = 0

    // Fetch real-time prices from Yahoo Finance
    if (holdings.length > 0) {
      for (const holding of holdings) {
        try {
          const quote = await yahooFinance.quote(holding.symbol)
          const currentPrice = quote.regularMarketPrice || holding.purchase_price
          totalPortfolioValue += (parseFloat(holding.quantity) * currentPrice)
        } catch (err) {
          // If quote fails, use purchase price as fallback
          totalPortfolioValue += (parseFloat(holding.quantity) * holding.purchase_price)
        }
      }
    }

    // Fetch recent expenses
    const expenses = (await pool.query(
      "SELECT amount, category, date FROM expenses WHERE user_id = $1 AND date::date <= CURRENT_DATE ORDER BY date DESC LIMIT 5",
      [req.session.user_id]
    )).rows

    // Call Python Stability API (with error handling)
    let aiInsights = { stability_score: 0, profile_label: "Loading..." }
    try {
      const pythonRes = await axios.post("http://localhost:8000/analyze-financial-profile", {
        user_id: req.session.user_id.toString(),
        expenses: expenses
      }, { timeout: 5000 })
      aiInsights = pythonRes.data.financial_profile
    } catch (err) {
      console.log("AI API unavailable, using defaults")
    }

    res.json({
      totalValue: totalPortfolioValue,
      recentExpenses: expenses,
      aiInsights: aiInsights
    })
  } catch (err) {
    console.error("Dashboard Error:", err)
    res.status(500).send()
  }
})

/* =========================================
    AI / PYTHON API INTEGRATION
    ========================================= */

/* Stock Recommendations */
app.post("/api/get-recommendations", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const userResult = await pool.query(
      `SELECT occupation, annual_income_range, savings_percent, risk_label
       FROM newusers
       WHERE id = $1`,
      [req.session.user_id]
    )
    const user = userResult.rows[0] || {}

    const profileContext = {
      occupation: user.occupation || "Other",
      annual_income_estimate: annualIncomeFromRange(user.annual_income_range),
      savings_ratio: savingsRatioFromBucket(user.savings_percent),
      risk_label: Number(user.risk_label) || 3,
      primary_goal: "Wealth",
      time_horizon: 2
    }

    const payload = {
      ...req.body,
      user_id: req.session.user_id,
      user_profile: profileContext
    }

    const pythonRes = await axios.post("http://localhost:8001/recommend", payload)
    res.json(pythonRes.data)
  } catch (err) {
    console.error("ML Stock API Error:", err.message)
    res.status(500).json({ message: "AI Service Offline" })
  }
})

/* Financial Profile Analysis */
app.get("/api/get-financial-profile", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const [expenses, userResult] = await Promise.all([
      pool.query(
        "SELECT date as timestamp, category, amount FROM expenses WHERE user_id = $1 AND date::date <= CURRENT_DATE",
        [req.session.user_id]
      ),
      pool.query(
        "SELECT annual_income_range FROM newusers WHERE id = $1",
        [req.session.user_id]
      )
    ])

    const annualIncome = annualIncomeFromRange(userResult.rows[0]?.annual_income_range)
    const monthlyIncome = annualIncome > 0 ? Math.round(annualIncome / 12) : 0

    const pythonRes = await axios.post("http://localhost:8000/analyze-financial-profile", {
      user_id: req.session.user_id.toString(),
      expenses: expenses.rows,
      monthly_income: monthlyIncome
    })

    res.json(pythonRes.data)
  } catch (err) {
    res.status(500).json({ message: "AI Review Analysis failed" })
  }
})

/* AI Analysis for Dashboard */
app.get("/api/ai-analysis", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    const expenses = await pool.query(
      "SELECT date as timestamp, category, amount FROM expenses WHERE user_id = $1 AND date::date <= CURRENT_DATE",
      [req.session.user_id]
    )

    const pythonRes = await axios.post("http://localhost:8000/analyze-financial-profile", {
      user_id: req.session.user_id.toString(),
      expenses: expenses.rows
    })

    const expenseRows = Array.isArray(expenses.rows) ? expenses.rows : []
    const profile = pythonRes.data?.financial_profile || {}
    const profileLabel = profile.profile_label || "Needs Attention"
    const stabilityScore = Number(profile.stability_score || 0)

    const categoryTotals = expenseRows.reduce((acc, row) => {
      const category = row.category || "Other"
      const amount = Number(row.amount || 0)
      if (Number.isFinite(amount) && amount > 0) {
        acc[category] = (acc[category] || 0) + amount
      }
      return acc
    }, {})

    const topCategoryEntry = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])[0]

    const topCategory = topCategoryEntry ? topCategoryEntry[0] : "Discretionary"
    const avgSpend = expenseRows.length > 0
      ? expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0) / expenseRows.length
      : 0

    const suggestions = [
      {
        category: "Financial Profile",
        title: "Financial Profile: " + profileLabel,
        text: `Your spending stability is ${stabilityScore.toFixed(1)}%. Maintain consistent weekly limits to improve reliability.`,
        level: profileLabel === "Unstable" ? "High" : "Medium",
        icon_name: "activity",
        monetary_gain: "Risk Management"
      },
      {
        category: "Cash Flow",
        title: "Protect Monthly Savings First",
        text: "Create a fixed auto-transfer on salary day so savings happen before discretionary expenses.",
        level: "High",
        icon_name: "piggy-bank",
        monetary_gain: avgSpend > 0 ? `~₹${Math.round(avgSpend * 0.15).toLocaleString("en-IN")}/mo` : "Improved consistency"
      },
      {
        category: "Expense Focus",
        title: `Optimize ${topCategory} Spending`,
        text: `Your highest spend concentration is in ${topCategory}. Apply a category cap and review weekly variance.`,
        level: "Medium",
        icon_name: "target",
        monetary_gain: topCategoryEntry ? `Focus on ₹${Math.round(topCategoryEntry[1]).toLocaleString("en-IN")}` : "Category control"
      }
    ]

    res.json({
      suggestions
    })
  } catch (err) {
    res.status(500).json({ message: "Stability API Error" })
  }
})

function mapExpenseCategoryToHabitCategory(category) {
  const raw = String(category || "").trim().toLowerCase()

  if (["rent", "home rent"].includes(raw)) return "rent"
  if (["emi"].includes(raw)) return "rent"
  if (["insurance", "lic"].includes(raw)) return "insurance"
  if (["loan payments", "loan"].includes(raw)) return "loan payments"
  if (["food and groceries", "food", "groceries"].includes(raw)) return "food and groceries"
  if (["utilities", "electricity", "water", "gas", "internet"].includes(raw)) return "utilities"
  if (["transport", "travel", "fuel", "petrol", "uber", "ola"].includes(raw)) return "transport"
  if (["medical", "healthcare", "medicine"].includes(raw)) return "medical"
  if (["dining out", "dinning out", "restaurant"].includes(raw)) return "dining out"
  if (["shopping", "retail"].includes(raw)) return "shopping"
  if (["entertainment", "movies"].includes(raw)) return "entertainment"
  if (["subscriptions", "subscription"].includes(raw)) return "subscriptions"
  if (raw.startsWith("other")) return "shopping"

  return "shopping"
}

function priorityToScore(priority) {
  if (typeof priority === "number" && Number.isFinite(priority)) {
    return Math.max(1, Math.min(5, Math.round(priority)))
  }

  const text = String(priority || "").trim().toLowerCase()
  if (text === "high") return 5
  if (text === "medium" || text === "moderate") return 3
  if (text === "low") return 2
  return 3
}

/* Habit + Goal Conflict Intelligence */
app.get("/api/habit-goalconflict", async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })

  try {
    // Fetch goals from FastAPI (same source as dashboard dropdown) to ensure matching goal IDs
    let fastapiGoals = []
    try {
      const goalsResponse = await axios.get('http://localhost:8005/api/goals', {
        headers: { 'x-user-id': req.session.user_id.toString() },
        timeout: 3000
      })
      fastapiGoals = Array.isArray(goalsResponse.data) ? goalsResponse.data : []
    } catch (err) {
      console.error('[Habit API] CRITICAL: Could not fetch goals from FastAPI:', err.message)
      // DO NOT fall back to legacy PostgreSQL goals - they may contain deleted goals
    }

    const [expensesResult, userResult] = await Promise.all([
      pool.query(
        `SELECT amount, category, date
         FROM expenses
         WHERE user_id = $1
           AND date::date <= CURRENT_DATE
           AND COALESCE(nature, 'Variable') != 'Fixed'
         ORDER BY date DESC`,
        [req.session.user_id]
      ),
      pool.query(
        `SELECT annual_income_range, savings_percent, occupation, risk_label
         FROM newusers
         WHERE id = $1`,
        [req.session.user_id]
      )
    ])

    const expenses = expensesResult.rows || []
    const user = userResult.rows[0] || {}

    if (expenses.length < 2) {
      return res.status(400).json({
        message: "Not enough expense history for habit analysis",
        minimum_required: 2
      })
    }

    const parsedExpenses = expenses
      .map((e) => ({
        amount: Number(e.amount),
        category: e.category,
        date: e.date ? new Date(e.date) : null
      }))
      .filter((e) => Number.isFinite(e.amount) && e.amount > 0 && e.date && !Number.isNaN(e.date.getTime()))

    if (parsedExpenses.length < 2) {
      return res.status(400).json({
        message: "Not enough valid expense records for habit analysis",
        minimum_required: 2
      })
    }

    const latest = parsedExpenses[0]
    const totalSpend = parsedExpenses.reduce((sum, e) => sum + e.amount, 0)
    const averageSpend = totalSpend / parsedExpenses.length

    const minTs = Math.min(...parsedExpenses.map((e) => e.date.getTime()))
    const maxTs = Math.max(...parsedExpenses.map((e) => e.date.getTime()))
    const spanWeeks = Math.max(1, Math.ceil((maxTs - minTs) / (1000 * 60 * 60 * 24 * 7)))
    const avgWeeklyFrequency = Math.max(1, Math.round(parsedExpenses.length / spanWeeks))

    const weeklyBuckets = new Map()
    for (const e of parsedExpenses) {
      const year = e.date.getUTCFullYear()
      const start = new Date(Date.UTC(year, 0, 1))
      const dayOfYear = Math.floor((e.date - start) / (1000 * 60 * 60 * 24))
      const week = Math.floor(dayOfYear / 7)
      const key = `${year}-${week}`
      weeklyBuckets.set(key, (weeklyBuckets.get(key) || 0) + 1)
    }
    const weeklyCounts = Array.from(weeklyBuckets.values())
    const meanWeekly = weeklyCounts.reduce((s, v) => s + v, 0) / Math.max(1, weeklyCounts.length)
    const variance = weeklyCounts.reduce((s, v) => s + Math.pow(v - meanWeekly, 2), 0) / Math.max(1, weeklyCounts.length)
    const stdDev = Math.sqrt(variance)
    const consistency = Math.max(0, Math.min(1, meanWeekly <= 0 ? 0.5 : 1 - stdDev / (meanWeekly + 1)))

    const weekendTxCount = parsedExpenses.filter((e) => {
      const d = e.date.getDay()
      return d === 0 || d === 6
    }).length
    const weekendRatio = weekendTxCount / parsedExpenses.length

    const categorySpend = new Map()
    const categoryCount = new Map()
    for (const e of parsedExpenses) {
      const key = mapExpenseCategoryToHabitCategory(e.category)
      categorySpend.set(key, (categorySpend.get(key) || 0) + e.amount)
      categoryCount.set(key, (categoryCount.get(key) || 0) + 1)
    }
    const dominantCategory = Array.from(categorySpend.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "shopping"

    // Calculate monthly expense breakdown by category (for realistic savings calculations)
    const monthlyExpensesByCategory = {}
    const sortedCategories = Array.from(categorySpend.entries()).sort((a, b) => b[1] - a[1])
    for (const [cat, total] of sortedCategories) {
      // Convert to monthly based on the expense span
      const monthlyAmount = spanWeeks > 0 ? (total / spanWeeks) * 4.33 : total
      monthlyExpensesByCategory[cat] = {
        monthly_total: Number(monthlyAmount.toFixed(2)),
        transaction_count: categoryCount.get(cat) || 0,
        average_transaction: Number((total / (categoryCount.get(cat) || 1)).toFixed(2))
      }
    }
    const totalMonthlyDiscretionary = Object.values(monthlyExpensesByCategory)
      .reduce((sum, c) => sum + c.monthly_total, 0)

    const annualIncome = annualIncomeFromRange(user.annual_income_range)
    const savingsRatio = savingsRatioFromBucket(user.savings_percent)
    const monthlySavingsCapacity = annualIncome > 0 && savingsRatio > 0
      ? (annualIncome * savingsRatio) / 12
      : 0

    // ONLY use FastAPI goals (same source as dashboard dropdown) for consistency
    // Do NOT fall back to legacy PostgreSQL goals to avoid stale/deleted goals appearing
    let activeGoals = []
    console.log('[Habit API] FastAPI goals received:', fastapiGoals.length, 'goals')
    
    // FastAPI goals structure: { id, name, target_amount, target_value, deadline, current_value, ... }
    activeGoals = fastapiGoals.map((g) => {
      const targetAmount = Number(g.target_amount || g.target_value || 0)
      const currentAmount = Number(g.current_value || 0)
      // Calculate timeline_months from deadline
      let timelineMonths = 12
      if (g.deadline) {
        const deadlineDate = new Date(g.deadline)
        const now = new Date()
        const diffMs = deadlineDate - now
        timelineMonths = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)))
      }
      console.log('[Habit API] Processing goal:', { id: g.id, name: g.name, target: targetAmount })
      return {
        goal_id: g.id,
        goal_name: g.name || "Goal",
        goal_type: "General",
        target_amount: targetAmount,
        current_amount: currentAmount,
        timeline_months: timelineMonths,
        priority: 3, // Default priority for FastAPI goals
        protected_categories: []
      }
    }).filter((g) => g.target_amount > 0)
    
    console.log('[Habit API] Final active goals:', activeGoals.map(g => ({ id: g.goal_id, name: g.goal_name })))
    
    if (activeGoals.length === 0) {
      console.warn('[Habit API] No goals from FastAPI, habit analysis may be limited')
    }

    const payload = {
      avg_weekly_frequency: avgWeeklyFrequency,
      consistency: Number(consistency.toFixed(4)),
      average_spend: Number(averageSpend.toFixed(2)),
      weeks_active: Math.max(1, weeklyBuckets.size),
      weekend_ratio: Number(weekendRatio.toFixed(4)),
      night_ratio: 0.2,
      category: dominantCategory,
      transaction_amount: Number(latest.amount.toFixed(2)),
      transaction_hour: 20,
      monthly_savings_capacity: Number(monthlySavingsCapacity.toFixed(2)),
      active_goals: activeGoals,
      // NEW: Actual expense data for realistic savings calculations
      expense_breakdown: {
        total_monthly_discretionary: Number(totalMonthlyDiscretionary.toFixed(2)),
        category_details: monthlyExpensesByCategory,
        expense_count: parsedExpenses.length,
        date_range_weeks: spanWeeks
      },
      profile_context: {
        occupation: user.occupation || "Other",
        risk_label: Number(user.risk_label || 3),
        primary_goal: "Wealth",
        time_horizon: 2
      }
    }

    const habitEngineTargets = [
      "http://localhost:8006/habits/analyze",
      "http://localhost:8002/habits/analyze"
    ]

    let response = null
    let lastError = null

    for (const target of habitEngineTargets) {
      try {
        response = await axios.post(target, payload, { timeout: 4000 })
        if (response?.data) break
      } catch (engineError) {
        lastError = engineError
      }
    }

    if (!response?.data) {
      throw lastError || new Error("Habit goal-conflict service did not respond")
    }

    const engineData = response.data || {}
    const ranked = Array.isArray(engineData.ranked_recommendations)
      ? [...engineData.ranked_recommendations]
      : []

    if (ranked.length > 0 && ranked.length < 3) {
      const fallbackRanked = [
        {
          recommendation: "Create weekly discretionary caps and review every Sunday.",
          score: 0.74,
          score_tier: "High",
          why_ranked: "Controls weekly leakage and improves spending consistency.",
          impacts_goal: "Primary Goal",
          feasibility_impact_pct: -8.0,
          goal_success_probability_before: 62.0,
          goal_success_probability_after: 73.0,
          goal_timeline_reduction_months: 1.7,
          difficulty_level: "Moderate",
          technical_why: "Improves budget adherence and lowers variance."
        },
        {
          recommendation: "Automate savings on payday before discretionary spending.",
          score: 0.68,
          score_tier: "Moderate",
          why_ranked: "Locks in savings discipline and reduces goal slippage.",
          impacts_goal: "Primary Goal",
          feasibility_impact_pct: -6.5,
          goal_success_probability_before: 62.0,
          goal_success_probability_after: 70.0,
          goal_timeline_reduction_months: 1.3,
          difficulty_level: "Easy",
          technical_why: "Improves fixed contribution consistency."
        }
      ]

      const existing = new Set(
        ranked.map((item) => String(item?.recommendation || "").trim().toLowerCase())
      )
      for (const template of fallbackRanked) {
        const key = String(template.recommendation || "").trim().toLowerCase()
        if (existing.has(key)) continue
        ranked.push({
          rank: ranked.length + 1,
          ...template
        })
        existing.add(key)
        if (ranked.length >= 3) break
      }
    }

    return res.json({
      source: "habit_goalconflict_airanking",
      input_snapshot: payload,
      ...engineData,
      ranked_recommendations: ranked
    })
  } catch (err) {
    const detail = err.response?.data || err.message
    return res.status(500).json({
      message: "Habit Goal-Conflict Engine Offline",
      detail,
      expected_ports: [8006, 8002]
    })
  }
})

/* Goal Feasibility Assessment */
app.post("/api/assess-goal-feasibility", async (req, res) => {
  if (!req.session.user_id) return res.status(401).send()

  try {
    const targetAmount = Number(req.body.target_amount ?? req.body.target_value)
    let durationMonths = Number(req.body.duration_months)
    const monthlyInvestment = Number(req.body.monthly_investment ?? req.body.monthly_capacity)

    if ((!durationMonths || durationMonths <= 0) && req.body.deadline) {
      const now = new Date()
      const deadline = new Date(req.body.deadline)
      const diffMs = deadline.getTime() - now.getTime()
      if (!Number.isNaN(diffMs) && diffMs > 0) {
        durationMonths = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30))
      }
    }

    durationMonths = Math.max(1, Number.isFinite(durationMonths) ? durationMonths : 1)

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      return res.status(400).json({ error: "Invalid target amount" })
    }

    const userResult = await pool.query(
      "SELECT annual_income_range, savings_percent, risk_label FROM newusers WHERE id = $1",
      [req.session.user_id]
    )
    const user = userResult.rows[0] || {}

    const annualIncome = annualIncomeFromRange(user.annual_income_range)
    const savingsRatio = savingsRatioFromBucket(user.savings_percent)
    const investmentStyle = riskStyleFromLabel(user.risk_label)

    const aiProfile = {
      income: annualIncome > 0 ? annualIncome : 420000,
      savings_ratio: savingsRatio,
      investment_style: investmentStyle,
      monthly_capacity: Number.isFinite(monthlyInvestment) && monthlyInvestment > 0 ? monthlyInvestment : 5000,
      goal_amount: targetAmount,
      timeline_months: durationMonths
    }

    const response = await axios.post("http://localhost:8004/goal/assess", aiProfile)
    res.json(response.data)
  } catch (err) {
    res.status(500).json({ error: "Feasibility Engine Offline" })
  }
})

/* =========================================
    START SERVER
    ========================================= */

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
  console.log("Using Yahoo Finance for stock data (no API key needed)")
  console.log("Portfolio Analysis API proxy: /pa-api/* -> http://localhost:8005/api/*")
  console.log("Make sure FastAPI is running: uvicorn portfolio_app:app --port 8005")
})

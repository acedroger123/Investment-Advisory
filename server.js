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

const TIME_HORIZON_TO_YEARS = {
  1: 3,
  2: 5,
  3: 10,
  4: 15
}

const GOAL_MONTH_MULTIPLIER = {
  "Emergency savings": 18,
  "Education": 48,
  "House": 72,
  "Retirement": 120,
  "Wealth": 60
}

const RISK_TO_PROFIT_BUFFER = {
  1: 0.05,
  2: 0.08,
  3: 0.10,
  4: 0.12
}

const RISK_TO_PREFERENCE = {
  1: "low",
  2: "low",
  3: "moderate",
  4: "high"
}

const DEFAULT_SYMBOL_PRICES = {
  AAPL: 180,
  AMZN: 170,
  GOOGL: 165,
  JNJ: 160,
  KO: 60,
  MSFT: 420,
  NVDA: 900,
  PG: 160,
  TSLA: 200
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

function getInitialAllocationByRisk(riskLabel) {
  const risk = Number(riskLabel)

  if (risk <= 2) {
    return [
      { symbol: "KO", stock_name: "Coca-Cola", weight: 0.34 },
      { symbol: "JNJ", stock_name: "Johnson & Johnson", weight: 0.33 },
      { symbol: "PG", stock_name: "Procter & Gamble", weight: 0.33 }
    ]
  }

  if (risk === 3) {
    return [
      { symbol: "AAPL", stock_name: "Apple Inc.", weight: 0.30 },
      { symbol: "MSFT", stock_name: "Microsoft Corp.", weight: 0.30 },
      { symbol: "GOOGL", stock_name: "Alphabet Inc.", weight: 0.20 },
      { symbol: "AMZN", stock_name: "Amazon.com Inc.", weight: 0.20 }
    ]
  }

  return [
    { symbol: "NVDA", stock_name: "NVIDIA Corp.", weight: 0.30 },
    { symbol: "TSLA", stock_name: "Tesla Inc.", weight: 0.25 },
    { symbol: "AMZN", stock_name: "Amazon.com Inc.", weight: 0.20 },
    { symbol: "AAPL", stock_name: "Apple Inc.", weight: 0.15 },
    { symbol: "MSFT", stock_name: "Microsoft Corp.", weight: 0.10 }
  ]
}

function buildInitialGoalFromQuestionnaire({
  annual_income_range,
  savings_percent,
  risk_label,
  goal,
  time_horizon
}) {
  const monthlyIncome = INCOME_RANGE_TO_MONTHLY_INR[annual_income_range] || INCOME_RANGE_TO_MONTHLY_INR[1]
  const savingsRatio = SAVINGS_BUCKET_TO_RATIO[savings_percent] || SAVINGS_BUCKET_TO_RATIO[1]
  const years = TIME_HORIZON_TO_YEARS[time_horizon] || TIME_HORIZON_TO_YEARS[2]
  const goalMonths = GOAL_MONTH_MULTIPLIER[goal] || GOAL_MONTH_MULTIPLIER["Wealth"]

  const monthlySavings = monthlyIncome * savingsRatio
  const initialInvestment = Math.max(5000, Math.round(monthlySavings * 3))
  const targetAmount = Math.max(50000, Math.round(monthlySavings * goalMonths * (years / 5)))
  const profitBuffer = RISK_TO_PROFIT_BUFFER[risk_label] ?? 0.10
  const targetValue = Math.round(targetAmount * (1 + profitBuffer))

  const deadline = new Date()
  deadline.setFullYear(deadline.getFullYear() + years)

  return {
    name: `${goal} Goal`,
    description: `Auto-created from onboarding questionnaire`,
    targetAmount,
    profitBuffer,
    targetValue,
    initialInvestment,
    deadlineIso: deadline.toISOString().slice(0, 10),
    riskPreference: RISK_TO_PREFERENCE[risk_label] || "moderate",
    allocations: getInitialAllocationByRisk(risk_label)
  }
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
      goal, time_horizon, risk_label
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
      goal: String(goal || "").trim(),
      time_horizon: toInt(time_horizon),
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
      "time_horizon",
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
    if (!parsedPayload.goal) {
      return res.status(400).json({ message: "Invalid survey field: goal" })
    }

    await client.query("BEGIN")
    txStarted = true

    await client.query(
      `INSERT INTO questionnaire_responses
       (user_id, age_group, occupation, income_range, savings_percent,
        investment_experience, instruments_used_count, financial_comfort,
        loss_reaction, return_priority, volatility_comfort, goal, time_horizon, risk_label)
       VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        parsedPayload.goal,
        parsedPayload.time_horizon,
        parsedPayload.risk_label
      ]
    )

    await client.query(
      `UPDATE newusers 
       SET age_group=$1, occupation=$2, annual_income_range=$3, savings_percent=$4, 
           investment_experience=$5, instruments_used_count=$6, financial_comfort=$7,
           loss_reaction=$8, return_priority=$9, volatility_comfort=$10,
           goal=$11, time_horizon=$12, risk_label=$13, questionnaire_completed=TRUE 
       WHERE id=$14`,
      [
        parsedPayload.age_group, parsedPayload.occupation, parsedPayload.annual_income_range, parsedPayload.savings_percent,
        parsedPayload.investment_experience, parsedPayload.instruments_used_count, parsedPayload.financial_comfort,
        parsedPayload.loss_reaction, parsedPayload.return_priority, parsedPayload.volatility_comfort,
        parsedPayload.goal, parsedPayload.time_horizon, parsedPayload.risk_label,
        req.session.user_id
      ]
    )

    const paUserLookup = await client.query(
      "SELECT id FROM pa_users WHERE pg_user_id = $1 ORDER BY id ASC LIMIT 1",
      [req.session.user_id]
    )

    let paUserId = paUserLookup.rows[0]?.id

    if (!paUserId) {
      const paUsername = `pa_user_${req.session.user_id}`
      const paEmail = `pa_user_${req.session.user_id}@local.invalid`

      const createdPaUser = await client.query(
        `INSERT INTO pa_users (username, email, pg_user_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [paUsername, paEmail, req.session.user_id]
      )
      paUserId = createdPaUser.rows[0].id
    }

    const existingGoal = await client.query(
      "SELECT id FROM pa_goals WHERE user_id = $1 ORDER BY id ASC LIMIT 1",
      [paUserId]
    )

    if (!existingGoal.rows.length) {
      const initialPlan = buildInitialGoalFromQuestionnaire(parsedPayload)

      const goalInsert = await client.query(
        `INSERT INTO pa_goals
         (user_id, name, description, target_amount, profit_buffer, target_value,
          initial_investment, deadline, risk_preference, status)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
         RETURNING id`,
        [
          paUserId,
          initialPlan.name,
          initialPlan.description,
          initialPlan.targetAmount,
          initialPlan.profitBuffer,
          initialPlan.targetValue,
          initialPlan.initialInvestment,
          initialPlan.deadlineIso,
          initialPlan.riskPreference
        ]
      )

      const goalId = goalInsert.rows[0].id

      for (const allocation of initialPlan.allocations) {
        const cachedPrice = await client.query(
          `SELECT close
           FROM pa_stock_prices
           WHERE symbol = $1
           ORDER BY date DESC
           LIMIT 1`,
          [allocation.symbol]
        )

        const marketPrice = Number(cachedPrice.rows[0]?.close ?? DEFAULT_SYMBOL_PRICES[allocation.symbol] ?? 100)
        if (!Number.isFinite(marketPrice) || marketPrice <= 0) continue

        const targetAmount = initialPlan.initialInvestment * allocation.weight
        const quantity = Math.max(1, Math.floor(targetAmount / marketPrice))
        const totalInvested = Number((quantity * marketPrice).toFixed(2))

        await client.query(
          `INSERT INTO pa_holdings
           (goal_id, stock_symbol, stock_name, quantity, avg_buy_price, total_invested)
           VALUES
           ($1, $2, $3, $4, $5, $6)`,
          [goalId, allocation.symbol, allocation.stock_name, quantity, marketPrice, totalInvested]
        )

        await client.query(
          `INSERT INTO pa_transactions
           (goal_id, stock_symbol, stock_name, transaction_type, quantity, price, total_value,
            transaction_date, validated, validation_message, notes)
           VALUES
           ($1, $2, $3, 'BUY', $4, $5, $6, CURRENT_DATE, TRUE, $7, $8)`,
          [
            goalId,
            allocation.symbol,
            allocation.stock_name,
            quantity,
            marketPrice,
            totalInvested,
            "Initialized from onboarding",
            "Initial questionnaire-based allocation"
          ]
        )
      }
    }

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
      `SELECT age_group, occupation, annual_income_range, savings_percent, goal, time_horizon, risk_label, questionnaire_completed
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
      goal: user.goal,
      time_horizon: user.time_horizon
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
      `SELECT category, SUM(amount) as total 
       FROM expenses 
       WHERE user_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY category`,
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
       WHERE user_id = $1 AND date >= DATE_TRUNC('week', CURRENT_DATE)
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
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC, id DESC",
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

  const { amount, category, date, note, nature } = req.body

  try {
    const result = await pool.query(
      `INSERT INTO expenses (user_id, amount, category, date, note, nature) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.session.user_id, amount, category, date, note, nature]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ message: "Failed to add expense" })
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
    const amountRegex = /(?:Rs|INR)\.?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i
    const merchantRegex = /at\s+([A-Z\s]+)\s+on/i

    for (let email of rawEmails) {
      const amountMatch = email.body.match(amountRegex)

      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''))
        const merchantMatch = email.body.match(merchantRegex)
        const merchant = merchantMatch ? merchantMatch[1].trim() : "Auto-Debit"

        let category = "Shopping"
        let nature = "Discretionary"

        if (merchant.includes("ZOMATO") || merchant.includes("SWIGGY")) {
          category = "Food"
          nature = "Variable"
        }

        await pool.query(
          `INSERT INTO expenses (user_id, amount, category, note, nature, date) 
            VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
          [req.session.user_id, amount, category, `Auto-synced: ${merchant}`, nature]
        )

        foundCount++
      }
    }

    res.json({ message: "Sync complete", found_transactions: foundCount })
  } catch (err) {
    console.error("Email Sync Error:", err)
    res.status(500).json({ message: "Failed to scan emails" })
  }
})

/* Upload PDF Statement */
app.post("/api/upload-statement", upload.single("statement"), async (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ message: "Unauthorized" })
  if (!req.file) return res.status(400).json({ message: "No file uploaded" })

  try {
    const pdfData = await pdfParse(req.file.buffer)
    const text = pdfData.text

    let foundCount = 0
    const transactionRegex = /(\d{2}\/\d{2}\/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr)?/gi

    let match
    while ((match = transactionRegex.exec(text)) !== null) {
      const isCredit = match[4] && match[4].toLowerCase() === 'cr'

      if (!isCredit) {
        const description = match[2].trim()
        const amount = parseFloat(match[3].replace(/,/g, ''))

        const descUpper = description.toUpperCase()
        let category = "Miscellaneous"
        let nature = "Variable"

        if (descUpper.match(/ZOMATO|SWIGGY|EATCLUB|RESTAURANT|FOOD|CAFE/)) {
          category = "Food"; nature = "Variable"
        } else if (descUpper.match(/AMAZON|FLIPKART|MYNTRA|RETAIL|SHOPPING|DMART/)) {
          category = "Shopping"; nature = "Discretionary"
        } else if (descUpper.match(/NETFLIX|HOTSTAR|SPOTIFY|BOOKMYSHOW|THEATRE|YOUTUBE/)) {
          category = "Entertainment"; nature = "Discretionary"
        } else if (descUpper.match(/AIRTEL|JIO|ELECTRICITY|WATER|BESCOM|BILL|RECHARGE/)) {
          category = "Utilities"; nature = "Fixed"
        } else if (descUpper.match(/UBER|OLA|PETROL|SHELL|FUEL|METRO|RAPIDO/)) {
          category = "Travel"; nature = "Variable"
        } else if (descUpper.match(/RENT|SOCIETY|MAINTENANCE/)) {
          category = "Rent"; nature = "Fixed"
        } else if (descUpper.match(/LIC|INSURANCE|PREMIUM/)) {
          category = "Insurance"; nature = "Fixed"
        }

        await pool.query(
          `INSERT INTO expenses (user_id, amount, category, note, nature, date) 
            VALUES ($1, $2, $3, $4, $5, NOW())`,
          [req.session.user_id, amount, category, `PDF: ${description.substring(0, 45)}`, nature]
        )

        foundCount++
      }
    }

    res.json({ message: "PDF Processed", found_transactions: foundCount })
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

    console.log("✅ Returning", formatted.length, "results")
    if (formatted.length > 0) {
      console.log("First result:", formatted[0].symbol, "-", formatted[0].name)
    }
    console.log("=== END STOCK SEARCH ===\n")

    res.json(formatted)

  } catch (err) {
    console.error("\n❌ Stock Search Error:", err.message)
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
      "SELECT amount, category, date FROM expenses WHERE user_id = $1 ORDER BY date DESC LIMIT 5",
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
      `SELECT occupation, annual_income_range, savings_percent, risk_label, goal, time_horizon
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
      primary_goal: user.goal || "Wealth",
      time_horizon: Number(user.time_horizon) || 2
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
    const expenses = await pool.query(
      "SELECT date as timestamp, category, amount FROM expenses WHERE user_id = $1",
      [req.session.user_id]
    )

    const pythonRes = await axios.post("http://localhost:8000/analyze-financial-profile", {
      user_id: req.session.user_id.toString(),
      expenses: expenses.rows
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
      "SELECT date as timestamp, category, amount FROM expenses WHERE user_id = $1",
      [req.session.user_id]
    )

    const pythonRes = await axios.post("http://localhost:8000/analyze-financial-profile", {
      user_id: req.session.user_id.toString(),
      expenses: expenses.rows
    })

    res.json({
      suggestions: [
        {
          title: "Financial Profile: " + pythonRes.data.financial_profile.profile_label,
          text: `Your spending stability is ${pythonRes.data.financial_profile.stability_score}%.`,
          level: pythonRes.data.financial_profile.profile_label === "Unstable" ? "High" : "Low",
          icon_name: "activity",
          monetary_gain: "Risk Management"
        }
      ]
    })
  } catch (err) {
    res.status(500).json({ message: "Stability API Error" })
  }
})

function mapExpenseCategoryToHabitCategory(category) {
  const raw = String(category || "").trim().toLowerCase()

  if (["rent", "home rent"].includes(raw)) return "rent"
  if (["insurance", "lic"].includes(raw)) return "insurance"
  if (["loan", "emi", "loan payments"].includes(raw)) return "loan payments"
  if (["food", "food and groceries", "groceries"].includes(raw)) return "food and groceries"
  if (["utilities", "electricity", "water", "gas", "internet"].includes(raw)) return "utilities"
  if (["travel", "transport", "fuel", "petrol", "uber", "ola"].includes(raw)) return "transport"
  if (["medical", "healthcare", "medicine"].includes(raw)) return "medical"
  if (["dining out", "dinning out", "restaurant"].includes(raw)) return "dinning out"
  if (["shopping", "retail"].includes(raw)) return "shopping"
  if (["entertainment", "movies"].includes(raw)) return "entertainment"
  if (["subscriptions", "subscription"].includes(raw)) return "subscriptions"

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
    const [expensesResult, goalsResult, userResult] = await Promise.all([
      pool.query(
        `SELECT amount, category, date
         FROM expenses
         WHERE user_id = $1
         ORDER BY date DESC`,
        [req.session.user_id]
      ),
      pool.query(
        `SELECT name, target_amount, saved_amount, duration_months, priority
         FROM user_goals
         WHERE user_id = $1 AND COALESCE(status, 'active') <> 'deleted'
         ORDER BY id DESC`,
        [req.session.user_id]
      ),
      pool.query(
        `SELECT annual_income_range, savings_percent, occupation, risk_label, goal, time_horizon
         FROM newusers
         WHERE id = $1`,
        [req.session.user_id]
      )
    ])

    const expenses = expensesResult.rows || []
    const goals = goalsResult.rows || []
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
    for (const e of parsedExpenses) {
      const key = mapExpenseCategoryToHabitCategory(e.category)
      categorySpend.set(key, (categorySpend.get(key) || 0) + e.amount)
    }
    const dominantCategory = Array.from(categorySpend.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "shopping"

    const annualIncome = annualIncomeFromRange(user.annual_income_range)
    const savingsRatio = savingsRatioFromBucket(user.savings_percent)
    const monthlySavingsCapacity = annualIncome > 0 && savingsRatio > 0
      ? (annualIncome * savingsRatio) / 12
      : 0

    const activeGoals = goals.map((g) => ({
      goal_name: g.name || "Goal",
      goal_type: "General",
      target_amount: Number(g.target_amount || 0),
      current_amount: Number(g.saved_amount || 0),
      timeline_months: Math.max(1, Number(g.duration_months || 1)),
      priority: priorityToScore(g.priority),
      protected_categories: []
    })).filter((g) => g.target_amount > 0)

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
      profile_context: {
        occupation: user.occupation || "Other",
        risk_label: Number(user.risk_label || 3),
        primary_goal: user.goal || "Wealth",
        time_horizon: Number(user.time_horizon || 2)
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

    return res.json({
      source: "habit_goalconflict_airanking",
      input_snapshot: payload,
      ...response.data
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
  console.log("✅ Server running on http://localhost:3000")
  console.log("📊 Using Yahoo Finance for stock data (no API key needed)")
  console.log("🔗 Portfolio Analysis API proxy: /pa-api/* → http://localhost:8005/api/*")
  console.log("💡 Make sure FastAPI is running: uvicorn portfolio_app:app --port 8005")
})

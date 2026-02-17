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

/* ---------- PORTFOLIO ANALYSIS API PROXY ---------- */
/* Must be BEFORE express.json() so the raw body stream is forwarded intact */
app.use('/pa-api', createProxyMiddleware({
  target: 'http://localhost:8005',
  changeOrigin: true,
  pathRewrite: { '^/': '/api/' },
  onError: (err, req, res) => {
    console.error('Portfolio API Proxy Error:', err.message)
    res.status(502).json({
      error: 'Portfolio Analysis Engine is not running',
      detail: 'Start the FastAPI server: uvicorn portfolio_app:app --port 8005'
    })
  }
}))

app.use(express.json())

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

/* Proxy moved above express.json() — see line 23 */

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

    const result = await pool.query(
      `SELECT id, password, consent_given, questionnaire_completed FROM newusers WHERE email=$1`,
      [email]
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

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" })

    const exists = await pool.query("SELECT id FROM newusers WHERE email=$1", [email])

    if (exists.rows.length)
      return res.status(400).json({ message: "Email already registered" })

    const hashed = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO newusers (name, email, password, consent_given, questionnaire_completed)
       VALUES ($1, $2, $3, FALSE, FALSE)
       RETURNING id`,
      [name, email, hashed]
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

    await pool.query(
      `UPDATE newusers
       SET email=$1, dob=$2, country=$3, occupation=$4, annual_income_range=$5
       WHERE id=$6`,
      [email || null, dob || null, country || null, occupation || null, annual_income_range || null, req.session.user_id]
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

  try {
    const {
      age_group, occupation, income_range, savings_percent,
      investment_experience, instruments_used_count, financial_comfort,
      loss_reaction, return_priority, volatility_comfort,
      goal, time_horizon, risk_label
    } = req.body

    await pool.query(
      `UPDATE newusers 
       SET age_group=$1, occupation=$2, annual_income_range=$3, savings_percent=$4, 
           investment_experience=$5, instruments_used_count=$6, financial_comfort=$7,
           loss_reaction=$8, return_priority=$9, volatility_comfort=$10,
           goal=$11, time_horizon=$12, risk_label=$13, questionnaire_completed=TRUE 
       WHERE id=$14`,
      [
        age_group, occupation, income_range, savings_percent,
        investment_experience, instruments_used_count, financial_comfort,
        loss_reaction, return_priority, volatility_comfort,
        goal, time_horizon, risk_label,
        req.session.user_id
      ]
    )

    req.session.questionnaire_completed = true
    res.json({ message: "Survey saved" })
  } catch (err) {
    console.error("SURVEY ERROR:", err)
    res.status(500).json({ message: "Error saving survey" })
  }
})

/* =========================================
    PASSWORD RESET ROUTES
    ========================================= */

app.post("/password/request-otp", async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: "Email required" })

    const result = await pool.query("SELECT id FROM newusers WHERE email=$1", [email])
    if (!result.rows.length) return res.status(400).json({ message: "Email not found" })

    const otp = crypto.randomInt(100000, 999999).toString()

    req.session.password_reset_otp = otp
    req.session.password_reset_email = email
    req.session.password_reset_expires = Date.now() + 5 * 60 * 1000

    await transporter.sendMail({
      to: email,
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

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "Password too weak" })
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
    const pythonRes = await axios.post("http://localhost:8001/recommend", req.body)
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

/* Goal Feasibility Assessment */
app.post("/api/assess-goal-feasibility", async (req, res) => {
  if (!req.session.user_id) return res.status(401).send()

  try {
    const userResult = await pool.query(
      "SELECT annual_income_range, savings_percent, risk_label FROM newusers WHERE id = $1",
      [req.session.user_id]
    )
    const user = userResult.rows[0]

    // Map database values to AI-compatible numbers
    const savingsMap = {
      "Less than 10%": 0.05,
      "10-20%": 0.15,
      "20-30%": 0.25,
      "More than 30%": 0.35
    }
    const styleMap = {
      "Conservative": 0.3,
      "Balanced": 0.6,
      "Aggressive": 0.9
    }

    const aiProfile = {
      income: 35000,
      savings_ratio: savingsMap[user.savings_percent] || 0.1,
      investment_style: styleMap[user.risk_label] || 0.6,
      monthly_capacity: req.body.monthly_investment || 5000,
      goal_amount: req.body.target_amount,
      timeline_months: req.body.duration_months
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
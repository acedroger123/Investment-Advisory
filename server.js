

const express = require("express")
const cors = require("cors")
const session = require("express-session")
const PgSession = require("connect-pg-simple")(session)
const { Pool } = require("pg")
const bcrypt = require("bcrypt")
const path = require("path")

const app = express()
app.use(express.json())

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "SignUp_SignIn_DB",
  password: "root",
  port: 5432
})

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}))

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions"
  }),
  secret: process.env.SESSION_SECRET || "investment_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24
  }
}))

app.use(express.static(path.join(__dirname, "public")))

app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "Registration.html"))
)

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields required" })

  const exists = await pool.query(
    "SELECT id FROM newusers WHERE email=$1",
    [email]
  )

  if (exists.rows.length)
    return res.status(400).json({ message: "Email already registered" })

  const hashed = await bcrypt.hash(password, 10)

  const result = await pool.query(
    `
    INSERT INTO newusers
    (name,email,password,consent_given,questionnaire_completed)
    VALUES ($1,$2,$3,FALSE,FALSE)
    RETURNING id
    `,
    [name, email, hashed]
  )

  req.session.user_id = result.rows[0].id
  req.session.consent_given = false
  req.session.questionnaire_completed = false

  res.json({ message: "Registered successfully" })
})

app.post("/consent", async (req, res) => {
  if (!req.session.user_id)
    return res.status(401).json({ message: "Unauthorized" })

  await pool.query(
    "UPDATE newusers SET consent_given=TRUE WHERE id=$1",
    [req.session.user_id]
  )

  req.session.consent_given = true
  res.json({ message: "Consent recorded" })
})

app.post("/login", async (req, res) => {
  const { email, password } = req.body

  const result = await pool.query(
    `
    SELECT id,password,consent_given,questionnaire_completed
    FROM newusers WHERE email=$1
    `,
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

  res.json({
    consent_given: user.consent_given,
    questionnaire_completed: user.questionnaire_completed
  })
})

app.get("/auth/check", async (req, res) => {
  if (!req.session.user_id)
    return res.json({ logged_in: false })

  const result = await pool.query(
    "SELECT consent_given, questionnaire_completed FROM newusers WHERE id=$1",
    [req.session.user_id]
  )

  res.json({
    logged_in: true,
    ...result.rows[0]
  })
})

app.get("/guard/questionnaire", (req, res) => {
  res.json({
    allowed:
      !!req.session.user_id &&
      req.session.consent_given &&
      !req.session.questionnaire_completed
  })
})

app.post("/survey", async (req, res) => {
  if (!req.session.user_id)
    return res.status(401).json({ message: "Unauthorized" })

  if (req.session.questionnaire_completed)
    return res.status(400).json({ message: "Already submitted" })

  await pool.query(
    `
    INSERT INTO questionnaire_responses
    (
      user_id, age_group, occupation, income_range, savings_percent,
      investment_experience, instruments_used_count, financial_comfort,
      loss_reaction, return_priority, volatility_comfort,
      goal, time_horizon, risk_label
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `,
    [req.session.user_id, ...Object.values(req.body)]
  )

  await pool.query(
    "UPDATE newusers SET questionnaire_completed=TRUE WHERE id=$1",
    [req.session.user_id]
  )

  req.session.questionnaire_completed = true
  res.json({ message: "Questionnaire submitted" })
})

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out" }))
})

app.listen(3000, () =>
  console.log("Server running on http://localhost:3000")
)

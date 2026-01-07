const express = require("express")
const cors = require("cors")
const { Pool } = require("pg")
const bcrypt = require("bcrypt")
const session = require("express-session")
const PgSession = require("connect-pg-simple")(session)

const app = express()

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

app.use(express.json())

app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: "user_sessions"
  }),
  secret: "investment_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24
  }
}))

/* ---------- REGISTER ---------- */
app.post("/register", async (req, res) => {

  const { name, email, password } = req.body

  try {

    const exists = await pool.query(
      "SELECT id FROM newusers WHERE email=$1",
      [email]
    )

    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" })
    }

    const hashed = await bcrypt.hash(password, 10)

    const result = await pool.query(
      "INSERT INTO newusers (name,email,password,consent_given,questionnaire_completed) VALUES($1,$2,$3,FALSE,FALSE) RETURNING id",
      [name, email, hashed]
    )

    const userId = result.rows[0].id

    req.session.user_id = userId
    req.session.consent_given = false

    res.json({
      message: "Registration successful",
      user_id: userId
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }

})

/* ---------- CONSENT ---------- */
app.post("/consent", async (req, res) => {

  const { user_id } = req.body

  try {

    if (!req.session.user_id) {
      return res.status(401).json({ message: "No active session" })
    }

    await pool.query(
      "UPDATE newusers SET consent_given=TRUE WHERE id=$1",
      [user_id]
    )

    req.session.consent_given = true

    res.json({ message: "Consent recorded" })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Database error" })
  }

})

/* ---------- LOGIN ---------- */
app.post("/login", async (req, res) => {

  const { email, password } = req.body

  try {

    const result = await pool.query(
      "SELECT id,password,consent_given,questionnaire_completed FROM newusers WHERE email=$1",
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const user = result.rows[0]

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    req.session.user_id = user.id
    req.session.consent_given = user.consent_given
    req.session.questionnaire_completed = user.questionnaire_completed

    res.json({ message: "Login successful" })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }

})

/* ---------- AUTH CHECK ---------- */
app.get("/auth/check", (req,res) => {

  if (!req.session.user_id) {
    return res.json({ logged_in: false })
  }

  res.json({
    logged_in: true,
    questionnaire_completed: req.session.questionnaire_completed
  })

})

/* ---------- LOGOUT ---------- */
app.post("/logout", (req,res) => {
  req.session.destroy()
  res.json({ message: "Logged out" })
})

/* ---------- QUESTIONNAIRE SUBMIT ---------- */
app.post("/survey", async (req, res) => {

  const {
    age_group,
    occupation,
    income_range,
    savings_percent,
    investment_experience,
    instruments_used_count,
    financial_comfort,
    loss_reaction,
    return_priority,
    volatility_comfort,
    goal,
    time_horizon,
    risk_label
  } = req.body

  try {

    if (!req.session.user_id) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const userId = req.session.user_id

    await pool.query(
      "INSERT INTO questionnaire_responses (user_id,age_group,occupation,income_range,savings_percent,investment_experience,instruments_used_count,financial_comfort,loss_reaction,return_priority,volatility_comfort,goal,time_horizon,risk_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        userId,
        age_group,
        occupation,
        income_range,
        savings_percent,
        investment_experience,
        instruments_used_count,
        financial_comfort,
        loss_reaction,
        return_priority,
        volatility_comfort,
        goal,
        time_horizon,
        risk_label
      ]
    )

    await pool.query(
      "UPDATE newusers SET questionnaire_completed=TRUE WHERE id=$1",
      [userId]
    )

    req.session.questionnaire_completed = true

    res.json({ message: "Questionnaire completed" })

  } catch(err) {
    console.error(err)
    res.status(500).json({ message: "Database error" })
  }

})

app.listen(3000)

app.get("/auth/check", (req, res) => {
  if (req.session && req.session.user_id) {
    res.json({ logged_in: true })
  } else {
    res.json({ logged_in: false })
  }
})


const express = require("express")
const cors = require("cors")
const { Pool } = require("pg")
const bcrypt = require("bcrypt")

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "SignUp_SignIn_DB",
  password: "root",
  port: 5432
})

/* ---------- REGISTER ---------- */
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body

  try {
    const existing = await pool.query(
      "SELECT id FROM newusers WHERE email = $1",
      [email]
    )

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" })
    }

    // 🔐 HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO newusers (name, email, password, questionnaire_completed)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id`,
      [name, email, hashedPassword]
    )

    res.json({
      message: "Registration successful",
      user_id: result.rows[0].id
    })
  } catch (err) {
    console.error("REGISTER ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* ---------- LOGIN ---------- */
app.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      `SELECT id, password, questionnaire_completed
       FROM newusers
       WHERE email = $1`,
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const user = result.rows[0]

    // 🔐 COMPARE HASH
    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    res.json({
      message: "Login successful",
      user_id: user.id,
      questionnaire_completed: user.questionnaire_completed
    })
  } catch (err) {
    console.error("LOGIN ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* ---------- QUESTIONNAIRE ---------- */
app.post("/survey", async (req, res) => {
  const {
    user_id,
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
    await pool.query(
      `INSERT INTO questionnaire_responses
      (user_id, age_group, occupation, income_range, savings_percent,
       investment_experience, instruments_used_count, financial_comfort,
       loss_reaction, return_priority, volatility_comfort,
       goal, time_horizon, risk_label)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        user_id,
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
      "UPDATE newusers SET questionnaire_completed = TRUE WHERE id = $1",
      [user_id]
    )

    res.json({ message: "Questionnaire saved successfully" })
  } catch (err) {
    console.error("SURVEY ERROR:", err)
    res.status(500).json({ message: "Error saving questionnaire" })
  }
})

app.listen(3000, () => {
  console.log("Server running on port 3000")
})

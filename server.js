const express = require("express")
const cors = require("cors")
const { Pool } = require("pg")

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

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body

  try {
    const existingUser = await pool.query(
      "SELECT id FROM newusers WHERE email = $1",
      [email]
    )

    if (existingUser.rows.length > 0) {
      return res.json({ message: "Email already registered" })
    }

    await pool.query(
      "INSERT INTO newusers (name, email, password, consent_given) VALUES ($1, $2, $3, true)",
      [name, email, password]
    )

    res.json({ message: "Registration successful" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }
})

app.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      "SELECT id FROM newusers WHERE email = $1 AND password = $2",
      [email, password]
    )

    if (result.rows.length === 0) {
      return res.json({ message: "Invalid email or password" })
    }

    res.json({ message: "Login successful" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error" })
  }
})

app.listen(3000, () => {
  console.log("Server running on port 3000")
})


app.post("/survey", async (req, res) => {
  const {
    user_id,
    age_group,
    income_range,
    savings_percent,
    investment_experience,
    instruments_used_count,
    financial_comfort,
    loss_reaction,
    return_priority,
    volatility_comfort,
    risk_label
  } = req.body

  try {
    await pool.query(
      `INSERT INTO survey_responses
      (user_id, age_group, income_range, savings_percent,
       investment_experience, instruments_used_count,
       financial_comfort, loss_reaction, return_priority,
       volatility_comfort, risk_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        user_id,
        age_group,
        income_range,
        savings_percent,
        investment_experience,
        instruments_used_count,
        financial_comfort,
        loss_reaction,
        return_priority,
        volatility_comfort,
        risk_label
      ]
    )

    res.json({ message: "Survey saved successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Error saving survey" })
  }
})

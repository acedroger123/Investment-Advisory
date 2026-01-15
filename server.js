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

const app = express()
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

/* ---------- STATIC ---------- */
app.use(express.static(path.join(__dirname, "public")))

/* ---------- MAILER ---------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ---------- AUTH CHECK ---------- */
app.get("/auth/check", (req, res) => {
  if (!req.session.user_id) {
    return res.json({ logged_in: false })
  }

  const sensitiveUnlocked =
    req.session.sensitive_verified === true &&
    req.session.sensitive_verified_until &&
    Date.now() < req.session.sensitive_verified_until

  res.json({
    logged_in: true,
    sensitive_unlocked: sensitiveUnlocked
  })
})

/* ---------- REGISTER ---------- */
app.post("/register", async (req, res) => {
  try {
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
  } catch {
    res.status(500).json({ message: "Registration failed" })
  }
})

/* ---------- LOGIN ---------- */
app.post("/login", async (req, res) => {
  try {
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

    // 🔒 IMPORTANT: reset sensitive state on login
    req.session.sensitive_verified = false
    req.session.sensitive_verified_until = null

    res.json({
      consent_given: user.consent_given,
      questionnaire_completed: user.questionnaire_completed
    })
  } catch {
    res.status(500).json({ message: "Login failed" })
  }
})

/* ---------- REQUEST OTP ---------- */
app.post("/settings/request-otp", async (req, res) => {
  try {
    if (!req.session.user_id)
      return res.status(401).json({ message: "Unauthorized" })

    const otp = crypto.randomInt(100000, 999999).toString()

    req.session.settings_otp = otp
    req.session.settings_otp_expires = Date.now() + 5 * 60 * 1000

    const result = await pool.query(
      "SELECT email FROM newusers WHERE id=$1",
      [req.session.user_id]
    )

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

/* ---------- VERIFY OTP ---------- */
app.post("/settings/verify-otp", (req, res) => {
  const { otp } = req.body

  if (
    !req.session.settings_otp ||
    Date.now() > req.session.settings_otp_expires
  ) {
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

/* ---------- UPDATE PROFILE ---------- */
app.post("/settings/update-profile", async (req, res) => {
  try {
    if (!req.session.user_id)
      return res.status(401).json({ message: "Unauthorized" })

    if (
      req.session.sensitive_verified !== true ||
      Date.now() > req.session.sensitive_verified_until
    ) {
      return res.status(403).json({ message: "OTP verification required" })
    }

    const {
      email,
      dob,
      country,
      occupation,
      annual_income_range
    } = req.body

    await pool.query(
      `UPDATE newusers
       SET email=$1, dob=$2, country=$3, occupation=$4, annual_income_range=$5
       WHERE id=$6`,
      [
        email || null,
        dob || null,
        country || null,
        occupation || null,
        annual_income_range || null,
        req.session.user_id
      ]
    )

    res.json({ message: "Profile updated successfully" })
  } catch (err) {
    console.error("UPDATE ERROR:", err)
    res.status(500).json({ message: "Update failed" })
  }
})

app.get("/notifications/get", async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const result = await pool.query(
    `
    SELECT notif_email, notif_push, notif_monthly_report
    FROM newusers
    WHERE id = $1
    `,
    [req.session.user_id]
  )

  res.json(result.rows[0])
})


app.post("/notifications/update", async (req, res) => {
  try {
    if (!req.session.user_id) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const {
      notif_email,
      notif_push,
      notif_monthly_report
    } = req.body

    await pool.query(
      `
      UPDATE newusers
      SET
        notif_email = $1,
        notif_push = $2,
        notif_monthly_report = $3
      WHERE id = $4
      `,
      [
        !!notif_email,
        !!notif_push,
        !!notif_monthly_report,
        req.session.user_id
      ]
    )

    res.json({ message: "Notification preferences updated" })
  } catch (err) {
    console.error("NOTIFICATION UPDATE ERROR:", err)
    res.status(500).json({ message: "Failed to update notifications" })
  }
})


app.post("/password/request-otp", async (req, res) => {
  try {
    const { email } = req.body

    if (!email)
      return res.status(400).json({ message: "Email required" })

    const result = await pool.query(
      "SELECT id FROM newusers WHERE email=$1",
      [email]
    )

    if (!result.rows.length)
      return res.status(400).json({ message: "Email not found" })

    const otp = crypto.randomInt(100000, 999999).toString()

    req.session.password_reset_otp = otp
    req.session.password_reset_email = email
    req.session.password_reset_expires = Date.now() + 5 * 60 * 1000

    await transporter.sendMail({
      to: email,
      subject: "Password Change OTP",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`
    })

    res.json({ message: "OTP sent for password change" })
  } catch (err) {
    console.error("PASSWORD OTP ERROR:", err)
    res.status(500).json({ message: "Failed to send OTP" })
  }
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

    await pool.query(
      "UPDATE newusers SET password = $1 WHERE email = $2",
      [hashed, req.session.password_reset_email]
    )

    delete req.session.password_reset_verified
    delete req.session.password_reset_email

    res.json({ message: "Password changed successfully" })
  } catch (err) {
    console.error("PASSWORD CHANGE ERROR:", err)
    res.status(500).json({ message: "Password change failed" })
  }
})


app.post("/password/verify-otp", (req, res) => {
  const { otp } = req.body

  if (
    !req.session.password_reset_otp ||
    Date.now() > req.session.password_reset_expires
  ) {
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

/* ---------- LOGOUT ---------- */
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out" }))
})

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})

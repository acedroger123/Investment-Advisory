app.post("/login", async (req, res) => {
  const { email, password } = req.body

  const user = await pool.query(
    "SELECT * FROM users WHERE email = $1 AND password = $2",
    [email, password]
  )

  if (user.rows.length === 0) {
    res.json({ message: "Invalid email or password" })
    return
  }

  res.json({ message: "Login successful" })
})

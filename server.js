const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

app.post("/login", (req, res) => {
  res.json({ message: "Login successful" })
})

app.post("/register", (req, res) => {
  res.json({ message: "Registration successful" })
})

app.listen(3000, () => {
  console.log("Server running on port 3000")
})

const { Pool } = require("pg")

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "SignUp_SignIn_DB",
  password: "root",
  port: 5432
})

module.exports = pool

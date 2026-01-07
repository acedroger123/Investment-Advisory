document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("registerForm")

  form.addEventListener("submit", async (e) => {
    e.preventDefault()

    const name = document.getElementById("name").value.trim()
    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value
    const confirm = document.getElementById("confirmPassword").value

    if (!name || !email || password.length < 6) {
      alert("Fill all fields properly")
      return
    }

    if (password !== confirm) {
      alert("Passwords do not match")
      return
    }

    try {
      const response = await fetch("http://localhost:3000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password })
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.message)
        return
      }

      document.getElementById("privacyModal").style.display = "flex"

    } catch (err) {
      alert("Server not reachable")
    }
  })

})

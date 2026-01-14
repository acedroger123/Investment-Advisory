document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm")

  form.addEventListener("submit", async (e) => {

    e.preventDefault()

    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value

    try {

      const response = await fetch("http://localhost:3000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.message)
        return
      }

      const guard = await fetch("http://localhost:3000/auth/check", {
        credentials: "include"
      })

      const g = await guard.json()

      if (g.questionnaire_completed) {
        window.location.href = "dashboard.html"
      } else {
        window.location.href = "dashboard.html"
      }

    } catch(err) {
      alert("Server error")
    }

  })

})

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm")

  form.addEventListener("submit", async (event) => {
    event.preventDefault()

    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value

    clearErrors()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError("emailError", "Enter a valid email")
      return
    }

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

      if (result.questionnaire_completed) {
        window.location.href = "dashboard.html"
      } else {
        window.location.href = "questionnaire.html"
      }

    } catch (err) {
      alert("Server error during login")
    }

  })

})


function showError(id, message) {
  document.getElementById(id).innerText = message
}


function clearErrors() {
  document.querySelectorAll(".error").forEach(el => el.innerText = "")
}


function togglePassword(inputId, toggleElement) {

  const input = document.getElementById(inputId)

  if (input.type === "password") {
    input.type = "text"
  } else {
    input.type = "password"
  }

}

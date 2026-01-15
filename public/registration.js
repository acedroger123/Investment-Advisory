function toggle(id) {
  const input = document.getElementById(id)
  if (!input) return
  input.type = input.type === "password" ? "text" : "password"
}


document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("registerForm")
  const acceptBtn = document.getElementById("acceptBtn")

  form.addEventListener("submit", async e => {
    e.preventDefault()

    const name = document.getElementById("name").value.trim()
    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value
    const confirm = document.getElementById("confirmPassword").value

    if (password !== confirm) return alert("Passwords do not match")
    if (name.length < 3 || password.length < 6)
      return alert("Invalid details")

    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password })
    })

    const result = await res.json()
    if (!res.ok) return alert(result.message)

    document.getElementById("privacyModal").style.display = "flex"
  })

  acceptBtn.addEventListener("click", async () => {
    const res = await fetch("/consent", {
      method: "POST",
      credentials: "include"
    })

    if (res.ok) window.location.href = "questionnaire.html"
  })
})



function toggle(id) {
  const input = document.getElementById(id)
  if (!input) return
  input.type = input.type === "password" ? "text" : "password"
}

document.getElementById("changeBtn").addEventListener("click", async () => {
  const p1 = document.getElementById("newPassword").value
  const p2 = document.getElementById("confirmPassword").value

  if (!p1 || p1.length < 8)
    return alert("Password must be at least 8 characters")

  if (p1 !== p2)
    return alert("Passwords do not match")

  const res = await fetch("/password/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newPassword: p1 })
  })

  if (!res.ok) return alert("Password change failed")

  alert("Password changed successfully")
  window.location.href = "SignIn.html"
})
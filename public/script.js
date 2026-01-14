document.addEventListener("DOMContentLoaded", () => {

  const acceptBtn = document.getElementById("acceptBtn")

  if (acceptBtn) {
    acceptBtn.addEventListener("click", async () => {

      try {

        const response = await fetch("http://localhost:3000/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({})
        })

        if (!response.ok) {
          alert("Consent failed")
          return
        }

        window.location.href = "questionnaire.html"

      } catch (err) {
        alert("Consent API error")
      }

    })
  }

})


async function checkSessionAndRedirect() {

  try {

    const response = await fetch("http://localhost:3000/auth/check", {
      credentials: "include"
    })

    const result = await response.json()

    if (!result.logged_in) {
      window.location.href = "SignIn.html"
    }

  } catch (err) {
    window.location.href = "SignIn.html"
  }

}

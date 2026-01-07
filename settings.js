document.getElementById("profileForm").addEventListener("submit", async (e) => {

e.preventDefault()

const user_id = localStorage.getItem("user_id")

const dob = document.getElementById("dob").value
const country = document.getElementById("country").value.trim()
const occupation = document.getElementById("occupation").value.trim()
const annual_income_range = parseInt(document.getElementById("annual_income_range").value)
const dependents = parseInt(document.getElementById("dependents").value)

const alertBox = document.getElementById("profileAlert")

if (!dob || !country || !occupation) {
alertBox.innerText = "Please complete all profile fields."
return
}

const response = await fetch("http://localhost:3000/profile/update", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ user_id, dob, country, occupation, annual_income_range, dependents })
})

const result = await response.json()

alert(result.message)

if (response.ok) {
alertBox.innerText = ""
window.location.href = "dashboard.html"
}

})

async function loadProfileStatus() {

const user_id = localStorage.getItem("user_id")

if (!user_id) return

const response = await fetch(`http://localhost:3000/profile/status/${user_id}`)

const result = await response.json()

const alertBox = document.getElementById("profileAlert")

if (!result.completed) {
alertBox.innerText = "Your profile is incomplete. Please update your details."
alertBox.classList.add("blue")
} else {
alertBox.innerText = "Profile up to date."
alertBox.classList.add("green")
}

}

function logout() {
localStorage.clear()
window.location.href = "SignIn.html"
}

loadProfileStatus()

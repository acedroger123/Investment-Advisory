let currentStep = 0

const sections = document.querySelectorAll(".profile-section")
const tabs = document.querySelectorAll(".profile-tabs button")

function showStep(index) {
  sections.forEach((sec, i) => {
    sec.classList.toggle("active", i === index)
    tabs[i].classList.toggle("active", i === index)
  })
}

document.getElementById("nextBtn").onclick = () => {
  if (currentStep < sections.length - 1) {
    currentStep++
    showStep(currentStep)
  }
}

document.getElementById("prevBtn").onclick = () => {
  if (currentStep > 0) {
    currentStep--
    showStep(currentStep)
  }
}

tabs.forEach((tab, i) => {
  tab.onclick = () => {
    currentStep = i
    showStep(currentStep)
  }
})

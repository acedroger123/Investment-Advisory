document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
  })
})

const pageData = {
  title: "AI Recommendations",
  subtitle: "Personalized insights to improve your financial health",

  priorities: [
    {
      level: "High",
      count: 2,
      items: [
        {
          title: "Reduce Entertainment Spending",
          icon: "💡",
          color: "blue",
          tag: "Habit",
          summary: "Your entertainment expenses have increased significantly.",
          explanation: "Reducing discretionary spending can help boost your emergency fund."
        },
        {
          title: "Adjust Vacation Timeline",
          icon: "🎯",
          color: "purple",
          tag: "Goal",
          summary: "Your vacation savings goal may be delayed.",
          explanation: "Extending the goal timeline can reduce financial pressure."
        }
      ]
    },
    {
      level: "Medium",
      count: 2,
      items: [
        {
          title: "Portfolio Volatility Alert",
          icon: "🛡️",
          color: "red",
          tag: "Risk",
          summary: "Your portfolio shows high volatility.",
          explanation: "Diversification can reduce overall risk."
        },
        {
          title: "Optimize Emergency Fund Strategy",
          icon: "📈",
          color: "green",
          tag: "Savings",
          summary: "Your emergency fund is progressing well.",
          explanation: "Automating savings ensures consistency."
        }
      ]
    }
  ],

  savings: {
    title: "Monthly Savings Potential",
    amount: 445,
    description: "By following these recommendations, you could save additional money per month."
  }
};

document.getElementById("page-title").innerText = pageData.title;
document.getElementById("page-subtitle").innerText = pageData.subtitle;

const container = document.getElementById("recommendations-container");

pageData.priorities.forEach(priority => {
  const header = document.createElement("div");
  header.className = `priority-header ${priority.level.toLowerCase()}`;
  header.innerHTML = `
    <span>${priority.level} Priority</span>
    <span class="count">${priority.count} recommendations</span>
  `;
  container.appendChild(header);

  priority.items.forEach(item => {
    const card = document.createElement("div");
    card.className = `recommendation ${priority.level.toLowerCase()}-border`;
    card.innerHTML = `
      <div class="rec-header">
        <div class="icon ${item.color}">${item.icon}</div>
        <div>
          <h3>${item.title}</h3>
          <p class="tag">${item.tag}</p>
        </div>
      </div>

      <p class="rec-text">${item.summary}</p>

      <button class="toggle-btn">Hide explanation</button>
      <div class="explanation show">${item.explanation}</div>
    `;

    card.querySelector(".toggle-btn").onclick = function () {
      toggleExplanation(this);
    };

    container.appendChild(card);
  });
});


document.getElementById("savings-title").innerText = pageData.savings.title;
document.getElementById("savings-amount").innerText = `$${pageData.savings.amount}`;
document.getElementById("savings-text").innerText =
  `${pageData.savings.description} $${pageData.savings.amount} per month.`;


function toggleExplanation(button) {
  const explanation = button.nextElementSibling;
  explanation.classList.toggle("show");
  button.innerText = explanation.classList.contains("show")
    ? "Hide explanation"
    : "Show explanation";
}

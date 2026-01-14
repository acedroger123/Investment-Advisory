
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
  })
})


const uiText = {
  formTitle: "Create New Goal",
  fields: {
    goalName: "Goal Name",
    targetAmount: "Target Amount ($)",
    duration: "Duration (months)",
    priority: "Priority"
  },
  buttonText: "Create Goal"
};

const priorityOptions = ["Low", "Medium", "High"];

let goals = [
  {
    id: 1,
    name: "Emergency Fund",
    priority: "high",
    target: 10000,
    saved: 3500,
    duration: 12,
    status: "achievable"
  },
  {
    id: 2,
    name: "Vacation",
    priority: "medium",
    target: 3000,
    saved: 800,
    duration: 6,
    status: "at-risk"
  }
];

function setupForm() {
  document.getElementById("formTitle").innerText = uiText.formTitle;

  document.querySelector("label[for='goalName']").innerText = uiText.fields.goalName;
  document.querySelector("label[for='targetAmount']").innerText = uiText.fields.targetAmount;
  document.querySelector("label[for='duration']").innerText = uiText.fields.duration;
  document.querySelector("label[for='priority']").innerText = uiText.fields.priority;

  document.getElementById("createGoalBtn").innerText = uiText.buttonText;

  const prioritySelect = document.getElementById("priority");
  priorityOptions.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.toLowerCase();
    opt.textContent = p;
    prioritySelect.appendChild(opt);
  });

  document.getElementById("createGoalBtn").addEventListener("click", createGoal);
}


function renderGoals() {
  const container = document.getElementById("goalsContainer");
  container.innerHTML = "";

  goals.forEach(goal => {
    const percent = ((goal.saved / goal.target) * 100).toFixed(1);
    const monthlyRequired = ((goal.target - goal.saved) / goal.duration).toFixed(2);

    const card = document.createElement("div");
    card.className = "goal-card";

    card.innerHTML = `
      <div class="delete-btn" data-id="${goal.id}">🗑</div>

      <div class="goal-header">
        <h3>${goal.name}</h3>
        <span class="badge ${goal.priority}">${goal.priority}</span>
      </div>

      <span class="status ${goal.status}">
        ${goal.status === "achievable" ? "✔ Achievable" : "⚠ At-Risk"}
      </span>

      <div class="goal-details">
        <span>Progress</span>
        <strong>$${goal.saved} / $${goal.target}</strong>
      </div>

      <div class="progress-bar">
        <div class="progress" style="width:${percent}%"></div>
      </div>

      <p>${percent}% complete</p>

      <div class="goal-details">
        <div>
          <strong>Duration</strong><br>
          ${goal.duration} months
        </div>
        <div>
          <strong>Monthly Required</strong><br>
          $${monthlyRequired}
        </div>
      </div>

      <div class="info-box ${
        goal.status === "achievable" ? "info-success" : "info-warning"
      }">
        ${
          goal.status === "achievable"
            ? "On track to meet this goal based on current savings rate"
            : "Consider extending timeline or reducing other expenses"
        }
      </div>
    `;

    card.querySelector(".delete-btn").addEventListener("click", () =>
      deleteGoal(goal.id)
    );

    container.appendChild(card);
  });
}



function createGoal() {
  const goal = {
    id: Date.now(),
    name: document.getElementById("goalName").value,
    target: Number(document.getElementById("targetAmount").value),
    duration: Number(document.getElementById("duration").value),
    priority: document.getElementById("priority").value,
    saved: 0,
    status: "at-risk"
  };

  goals.push(goal);
  renderGoals();
}

function deleteGoal(id) {
  goals = goals.filter(goal => goal.id !== id);
  renderGoals();
}

setupForm();
renderGoals();

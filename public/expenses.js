const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const natureInput = document.getElementById("nature");
const dateInput = document.getElementById("date");
const noteInput = document.getElementById("note");
const expenseList = document.getElementById("expenseList");

const categoryData = {
  Fixed: ["Rent / EMI", "Insurance", "Loan Payments"],
  Variable: ["Food & Groceries", "Utilities", "Transport", "Medical"],
  Discretionary: ["Dining Out", "Shopping", "Entertainment", "Subscriptions", "Travel"]
};


document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
  })
})

let expenses = [];

Object.keys(categoryData).forEach(nature => {
  const optGroup = document.createElement("optgroup");
  optGroup.label = `${nature} Expenses`;

  categoryData[nature].forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    option.dataset.nature = nature;
    optGroup.appendChild(option);
  });

  categorySelect.appendChild(optGroup);
});


categorySelect.addEventListener("change", () => {
  const selectedOption =
    categorySelect.options[categorySelect.selectedIndex];
  natureInput.value = selectedOption.dataset.nature || "";
});


document.getElementById("addExpense").addEventListener("click", () => {
  const amount = parseFloat(amountInput.value);
  const category = categorySelect.value;
  const nature = natureInput.value;
  const date = dateInput.value;
  const note = noteInput.value;

  // Validation
  if (!amount || !category || !nature || !date) {
    alert("Please fill all required fields");
    return;
  }

  const expense = {
    amount,
    category,
    nature,
    date,
    note
  };

  expenses.push(expense);

  clearForm();
  updateUI();
});

function clearForm() {
  amountInput.value = "";
  categorySelect.value = "";
  natureInput.value = "";
  dateInput.value = "";
  noteInput.value = "";
}

function updateUI() {
  updateTable();
  updateOverview();
  updateAI();
}

function updateTable() {
  expenseList.innerHTML = "";

  expenses.forEach(e => {
    expenseList.innerHTML += `
      <tr>
        <td>${e.date}</td>
        <td>${e.category}</td>
        <td>${e.nature}</td>
        <td>₹${e.amount.toFixed(2)}</td>
        <td>${e.note || "-"}</td>
      </tr>
    `;
  });
}


function updateOverview() {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const fixed = sumByNature("Fixed");
  const variable = sumByNature("Variable");
  const discretionary = sumByNature("Discretionary");

  document.getElementById("total").textContent = `₹${total.toFixed(2)}`;
  document.getElementById("fixedStat").textContent = `Fixed: ${percent(fixed, total)}%`;
  document.getElementById("variableStat").textContent = `Variable: ${percent(variable, total)}%`;
  document.getElementById("discretionaryStat").textContent = `Discretionary: ${percent(discretionary, total)}%`;
  document.getElementById("savings").textContent = total > 0 ? "64%" : "0%";
}

function sumByNature(nature) {
  return expenses
    .filter(e => e.nature === nature)
    .reduce((sum, e) => sum + e.amount, 0);
}

function percent(value, total) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}


function updateAI() {
  document.getElementById("behavior").textContent =
    expenses.length >= 3
      ? "Irregular expense behavior identified."
      : "Not enough data for behavioral analysis.";

  document.getElementById("habit").textContent =
    expenses.length
      ? "Expense patterns are being analyzed."
      : "No recurring patterns detected yet.";
}
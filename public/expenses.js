document.addEventListener("DOMContentLoaded", () => {
  // --- DOM ELEMENTS (Updated IDs to match new white box) ---
  const modal = document.getElementById("addModal");
  const openBtn = document.getElementById("openAddModal");
  // Updated to match the top-right 'X' icon
  const closeBtn = document.getElementById("closeModalIcon");
  const form = document.getElementById("expenseForm");
  const list = document.getElementById("expenseList");
  const syncBtn = document.getElementById("syncGmailBtn");

  // State to hold real expenses from Database
  let expenses = [];

  // --- 1. MODAL LOGIC (Using .active class — matches goal modal) ---
  if (openBtn) openBtn.onclick = () => modal.classList.add("active");
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove("active");
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.onclick = () => modal.classList.remove("active");

  // --- 2. FETCH FROM DATABASE ---
  async function fetchExpenses() {
    try {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) window.location.href = "SignIn.html";
        return;
      }
      expenses = await res.json();
      renderExpenses();

      // TRIGGER AI ANALYSIS REFRESH
      updateAIInsights();
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  }

  // --- 3. RENDER LOGIC ---
  function renderExpenses() {
    if (!list) return;
    list.innerHTML = "";
    let total = 0;
    let fixed = 0;
    let discretionary = 0;

    expenses.forEach(e => {
      const amount = parseFloat(e.amount);
      total += amount;

      // Logic for Stability Model features (Fixed vs Discretionary)
      if (e.nature === "Fixed") fixed += amount;
      if (e.nature === "Discretionary" || e.nature === "Variable") discretionary += amount;

      const dateObj = new Date(e.date);
      const formattedDate = dateObj.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formattedDate}</td>
        <td><span class="badge" style="background: rgba(99, 102, 241, 0.2); color: var(--color-primary-light); padding: 4px 8px; border-radius: 4px;">${e.category}</span></td>
        <td><span style="font-size: 0.8rem; opacity: 0.7;">${e.nature}</span></td>
        <td style="font-weight: 600;">₹${amount.toLocaleString('en-IN')}</td>
        <td style="color: var(--text-muted); font-size: 0.9rem;">${e.note || ''}</td>
      `;
      list.appendChild(tr);
    });

    // Update KPI Cards on the Expense Page
    const totalEl = document.getElementById("totalAmount");
    const fixedEl = document.getElementById("fixedStat");
    const discEl = document.getElementById("discretionaryStat");

    if (totalEl) totalEl.innerText = `₹${total.toLocaleString('en-IN')}`;
    if (fixedEl) fixedEl.innerText = total ? Math.round((fixed / total) * 100) + "%" : "0%";
    if (discEl) discEl.innerText = total ? Math.round((discretionary / total) * 100) + "%" : "0%";
  }

  // --- 4. MANUAL ADD EXPENSE ---
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();

      const amount = Number(document.getElementById("amount").value);
      const category = document.getElementById("category").value;
      const date = document.getElementById("date").value;
      const note = document.getElementById("note").value;

      // AUTO-ASSIGN NATURE for ML Features
      let nature = "Variable";
      if (["Rent", "Utilities", "EMI", "Insurance", "Bills"].includes(category)) nature = "Fixed";
      else if (["Entertainment", "Shopping", "Dining Out"].includes(category)) nature = "Discretionary";

      try {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount, category, date, note, nature })
        });

        if (res.ok) {
          modal.classList.remove("active");
          form.reset();
          fetchExpenses(); // Refresh table from PostgreSQL
        }
      } catch (err) {
        console.error("Error adding expense:", err);
      }
    };
  }

  // --- 5. SYNC GMAIL & PDF UPLOAD ---
  const handleAction = async (btn, apiEndpoint, method = "GET", body = null) => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
      const options = { method, credentials: "include" };
      if (body) options.body = body;

      const response = await fetch(apiEndpoint, options);
      const data = await response.json();

      if (response.ok) {
        alert(`Success! Found ${data.found_transactions} transactions.`);
        fetchExpenses();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Network error. Please check if Python APIs are running.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  };

  if (syncBtn) syncBtn.onclick = () => handleAction(syncBtn, "/api/sync-emails");

  const uploadPdfBtn = document.getElementById("uploadPdfBtn");
  const pdfInput = document.getElementById("pdfUploadInput");

  if (uploadPdfBtn && pdfInput) {
    uploadPdfBtn.onclick = () => pdfInput.click();
    pdfInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("statement", file);
      handleAction(uploadPdfBtn, "/api/upload-statement", "POST", formData);
      pdfInput.value = "";
    };
  }

  // --- 6. SYNC WITH PYTHON ML MODELS ---
  async function updateAIInsights() {
    try {
      // Pings the stability API on Port 8000
      await fetch("/api/get-financial-profile", { credentials: "include" });
    } catch (e) {
      console.warn("AI models unreachable. Run run_all.py.");
    }
  }

  // Initial Load
  fetchExpenses();
});
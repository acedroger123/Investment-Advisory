/**
 * Transactions Page JavaScript
 * Per-goal stock allocation mode - goal_id is required
 */

let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    loadGoals();
    loadTransactions();
    setupEventListeners();
    setMaxTransactionDate();
});

function setMaxTransactionDate() {
    const dateInput = document.getElementById('transactionDate');
    if (dateInput) {
        dateInput.max = new Date().toISOString().split('T')[0];
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function setupEventListeners() {
    // Stock symbol search
    const symbolInput = document.getElementById('stockSymbol');
    if (symbolInput) {
        symbolInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchStocks(e.target.value), 300);
        });

        symbolInput.addEventListener('blur', () => {
            // Increased timeout to allow click/mousedown to complete first
            setTimeout(() => {
                document.getElementById('stockSuggestions').innerHTML = '';
            }, 300);
        });
    }

    // Calculate total on input change
    const quantityInput = document.getElementById('quantity');
    const priceInput = document.getElementById('price');

    [quantityInput, priceInput].forEach(input => {
        if (input) {
            input.addEventListener('input', calculateTotal);
        }
    });
}

async function loadGoals() {
    try {
        const goals = await API.Goals.list();

        const goalSelect = document.getElementById('goalSelect');
        const filterGoal = document.getElementById('filterGoal');

        // Reset goal selector - require goal selection
        goalSelect.innerHTML = '<option value="">Select a goal...</option>';

        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = goal.name;
            goalSelect.appendChild(option);

            const filterOption = option.cloneNode(true);
            filterGoal.appendChild(filterOption);
        });

        // Auto-select first goal if available
        if (goals.length > 0) {
            goalSelect.value = goals[0].id;
        }

    } catch (error) {
        console.error('Error loading goals:', error);
    }
}

async function loadTransactions() {
    const filterGoal = document.getElementById('filterGoal').value;
    const tbody = document.querySelector('#transactionsTable tbody');

    try {
        const transactions = await API.Transactions.list(filterGoal || null);

        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="9">No transactions yet. Add your first stock purchase!</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions.map(txn => `
            <tr>
                <td>${formatDate(txn.date)}</td>
                <td>
                    <span class="badge ${txn.type === 'BUY' ? 'badge-success' : 'badge-danger'}">
                        ${txn.type}
                    </span>
                </td>
                <td>
                    <strong>${txn.symbol}</strong>
                    <br><span class="text-muted">${txn.name || ''}</span>
                </td>
                <td>${txn.quantity}</td>
                <td>${formatCurrency(txn.price)}</td>
                <td>${formatCurrency(txn.total_value)}</td>
                <td>
                    ${txn.validated
                ? '<span class="text-success">✓ Valid</span>'
                : '<span class="text-warning">⚠ Unverified</span>'}
                </td>
                <td>
                    <span class="badge badge-info" style="font-size: 0.75rem;">Goal #${txn.goal_id}</span>
                </td>
                <td>
                    <button class="btn btn-sm" style="padding: 4px 8px; background: rgba(239,68,68,0.2); color: #ef4444;" 
                            onclick="deleteTransaction(${txn.id})">
                        🗑️
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading transactions:', error);
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">Error loading transactions.</td>
            </tr>
        `;
    }
}

async function searchStocks(query) {
    if (!query || query.length < 1) {
        document.getElementById('stockSuggestions').innerHTML = '';
        return;
    }

    try {
        const results = await API.Stocks.search(query, 5);
        const container = document.getElementById('stockSuggestions');

        if (results.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = results.map(stock => `
            <div class="suggestion-item" onmousedown="event.preventDefault(); selectStock('${stock.symbol}')">
                <strong>${stock.symbol}</strong>
                <span>${stock.name}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error searching stocks:', error);
    }
}

function selectStock(symbol) {
    document.getElementById('stockSymbol').value = symbol.replace('.NS', '').replace('.BO', '');
    document.getElementById('stockSuggestions').innerHTML = '';
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('quantity').value) || 0;
    const price = parseFloat(document.getElementById('price').value) || 0;
    const total = quantity * price;

    document.getElementById('totalValue').textContent = formatCurrency(total);
}

async function validatePrice() {
    const symbol = document.getElementById('stockSymbol').value;
    const date = document.getElementById('transactionDate').value;
    const price = parseFloat(document.getElementById('price').value);

    if (!symbol || !date || !price) {
        showToast('Please fill in symbol, date, and price first', 'error');
        return;
    }

    const resultDiv = document.getElementById('validationResult');
    resultDiv.style.display = 'flex';
    resultDiv.innerHTML = '<span class="loading">Validating...</span>';

    try {
        const result = await API.Stocks.validatePrice(symbol, date, price);

        resultDiv.innerHTML = `
            <span class="validation-icon">${result.is_valid ? '✅' : '⚠️'}</span>
            <span class="validation-message">${result.message}</span>
        `;
        resultDiv.className = `validation-result ${result.is_valid ? 'valid' : 'invalid'}`;

    } catch (error) {
        resultDiv.innerHTML = `
            <span class="validation-icon">❌</span>
            <span class="validation-message">Could not validate: ${error.message}</span>
        `;
        resultDiv.className = 'validation-result invalid';
    }
}

async function submitTransaction(event) {
    event.preventDefault();

    const goalId = document.getElementById('goalSelect').value;

    // goal_id is REQUIRED
    if (!goalId) {
        showToast('Please select a goal for this transaction', 'error');
        return;
    }

    const formData = {
        goal_id: parseInt(goalId),
        stock_symbol: document.getElementById('stockSymbol').value,
        transaction_type: document.getElementById('transactionType').value,
        transaction_date: document.getElementById('transactionDate').value,
        quantity: parseInt(document.getElementById('quantity').value),
        price: parseFloat(document.getElementById('price').value),
        notes: document.getElementById('notes').value || null,
    };

    try {
        const result = await API.Transactions.create(formData);

        if (result.warning) {
            showToast(result.warning, 'error');
        } else {
            showToast('Transaction recorded successfully!', 'success');
        }

        // Reset form
        document.getElementById('transactionForm').reset();
        setMaxTransactionDate();
        document.getElementById('totalValue').textContent = '₹0';
        document.getElementById('validationResult').style.display = 'none';

        // Reload transactions
        loadTransactions();

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function deleteTransaction(transactionId) {
    if (!confirm('Are you sure you want to delete this transaction? This will update the goal\'s holdings.')) {
        return;
    }

    try {
        await API.Transactions.delete(transactionId);
        showToast('Transaction deleted and holdings adjusted', 'success');
        loadTransactions();

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .transaction-form-section {
        margin-bottom: var(--spacing-xl);
    }
    
    .stock-suggestions {
        position: absolute;
        width: 100%;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        margin-top: 4px;
        z-index: 100;
        max-height: 200px;
        overflow-y: auto;
    }
    
    .suggestion-item {
        padding: 10px 15px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--glass-border);
    }
    
    .suggestion-item:hover {
        background: var(--glass-bg);
    }
    
    .suggestion-item strong {
        color: var(--color-primary-light);
    }
    
    .suggestion-item span {
        color: var(--text-muted);
        font-size: var(--font-size-sm);
    }
    
    .form-group {
        position: relative;
    }
    
    .validation-result {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-lg);
    }
    
    .validation-result.valid {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
    }
    
    .validation-result.invalid {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
    }
    
    .total-display {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-lg);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-lg);
    }
    
    .total-value {
        font-size: var(--font-size-2xl);
        font-weight: 700;
        color: var(--color-primary-light);
    }
`;
document.head.appendChild(style);

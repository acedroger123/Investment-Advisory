/**
 * Goals Page JavaScript
 */

let deleteGoalId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadGoals();
    setMinDeadlineDate();
});

function setMinDeadlineDate() {
    const deadlineInput = document.getElementById('goalDeadline');
    if (deadlineInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deadlineInput.min = tomorrow.toISOString().split('T')[0];

        const oneYear = new Date();
        oneYear.setFullYear(oneYear.getFullYear() + 1);
        deadlineInput.value = oneYear.toISOString().split('T')[0];
    }
}

async function loadGoals() {
    const grid = document.getElementById('goalsGrid');

    try {
        const goals = await API.Goals.list();

        if (goals.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>No goals yet</h3>
                    <p>Create your first financial goal to get started!</p>
                    <button class="btn btn-primary" onclick="showModal('goalModal')">Create Goal</button>
                </div>
            `;
            return;
        }

        grid.innerHTML = goals.map(goal => createGoalCard(goal)).join('');

    } catch (error) {
        console.error('Error loading goals:', error);
        grid.innerHTML = `
            <div class="error-state">
                <p>Could not load goals. Is the server running?</p>
                <button class="btn btn-secondary" onclick="loadGoals()">Retry</button>
            </div>
        `;
    }
}

// Risk benchmark data (mirrors backend RISK_BENCHMARKS)
const RISK_BENCHMARKS_FRONTEND = {
    low: { expected: 10, max: 12, color: '#10b981', label: 'Conservative' },
    moderate: { expected: 14, max: 20, color: '#f59e0b', label: 'Balanced' },
    high: { expected: 20, max: 30, color: '#ef4444', label: 'Aggressive' },
};

function createGoalCard(goal) {
    const progressColor = goal.progress >= 80 ? 'var(--color-accent-green)' :
        goal.progress >= 50 ? 'var(--color-accent-orange)' :
            'var(--color-primary)';

    const riskBadge = goal.risk_preference === 'high' ? 'badge-danger' :
        goal.risk_preference === 'moderate' ? 'badge-warning' : 'badge-success';

    const bench = RISK_BENCHMARKS_FRONTEND[goal.risk_preference] || RISK_BENCHMARKS_FRONTEND.moderate;

    return `
        <div class="goal-card" data-id="${goal.id}">
            <div class="goal-header">
                <h3>${goal.name}</h3>
                <span class="badge ${riskBadge}">${bench.label}</span>
            </div>

            <div class="risk-strategy-bar" style="
                background: rgba(0,0,0,0.2);
                border-left: 3px solid ${bench.color};
                border-radius: 6px;
                padding: 7px 12px;
                margin-bottom: 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.8rem;
            ">
                <span style="color: var(--text-muted);">📈 Expected Annual Return</span>
                <strong style="color: ${bench.color};">${bench.expected}% – ${bench.max}%</strong>
            </div>
            
            <div class="goal-progress">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>${goal.progress.toFixed(1)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(goal.progress, 100)}%; background: ${progressColor};"></div>
                </div>
            </div>
            <div class="goal-stats">
                <div class="goal-stat">
                    <span class="stat-label">Current Value</span>
                    <span class="stat-value">${formatCurrency(goal.current_value)}</span>
                </div>
                <div class="goal-stat">
                    <span class="stat-label">Target</span>
                    <span class="stat-value">${formatCurrency(goal.target_value)}</span>
                </div>
                <div class="goal-stat">
                    <span class="stat-label">Days Left</span>
                    <span class="stat-value">${goal.days_remaining}</span>
                </div>
            </div>
            
            <div class="goal-actions">
                <button class="btn btn-secondary btn-sm" onclick="editGoal(${goal.id})">Edit</button>
                <button class="btn btn-sm" style="background: rgba(239,68,68,0.2); color: #ef4444;" onclick="showDeleteModal(${goal.id})">Delete</button>
                <a href="index.html?goalId=${goal.id}" class="btn btn-primary btn-sm">View Dashboard</a>
            </div>
        </div>
    `;
}


async function saveGoal(event) {
    event.preventDefault();

    const goalId = document.getElementById('goalId').value;
    const formData = {
        name: document.getElementById('goalName').value,
        description: document.getElementById('goalDescription').value || null,
        target_amount: parseFloat(document.getElementById('targetAmountInput').value),
        profit_buffer: parseFloat(document.getElementById('profitBuffer').value) / 100,
        deadline: document.getElementById('goalDeadline').value,
        risk_preference: document.getElementById('riskPreference').value,
    };

    try {
        if (goalId) {
            await API.Goals.update(goalId, formData);
            showToast('Goal updated successfully!', 'success');
        } else {
            await API.Goals.create(formData);
            showToast('Goal created successfully!', 'success');
        }

        hideModal('goalModal');
        resetForm();
        loadGoals();

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ─── Feasibility ─────────────────────────────────────────────────────────────

let _feasibilityTimer = null;

function scheduleFeasibilityCheck() {
    clearTimeout(_feasibilityTimer);
    _feasibilityTimer = setTimeout(runFeasibilityCheck, 600);
}

async function runFeasibilityCheck() {
    const targetVal = document.getElementById('targetAmountInput').value;
    const bufferVal = document.getElementById('profitBuffer').value;
    const deadline = document.getElementById('goalDeadline').value;
    const risk = document.getElementById('riskPreference').value;

    // Need at least target + deadline to check
    if (!targetVal || !deadline) return;

    const data = {
        target_amount: parseFloat(targetVal),
        profit_buffer: parseFloat(bufferVal || 10) / 100,
        deadline: deadline,
        risk_preference: risk,
    };

    const panel = document.getElementById('feasibilityPanel');
    panel.style.display = 'block';
    panel.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">Checking feasibility…</p>';

    try {
        const result = await API.Goals.checkFeasibility(data);
        renderFeasibilityPanel(result);
    } catch (err) {
        panel.innerHTML = '';
        panel.style.display = 'none';
    }
}

function renderFeasibilityPanel(r) {
    const level = r.feasibility_level; // "feasible" | "challenging" | "impossible"

    const colors = {
        feasible: { bg: 'rgba(16,185,129,0.1)', border: '#10b981', badge: '#10b981', icon: '🟢' },
        challenging: { bg: 'rgba(245,158,11,0.1)', border: '#f59e0b', badge: '#f59e0b', icon: '🟡' },
        impossible: { bg: 'rgba(239,68,68,0.1)', border: '#ef4444', badge: '#ef4444', icon: '🔴' },
    };
    const c = colors[level] || colors.impossible;

    const optA = r.options?.option_a;
    const optB = r.options?.option_b;
    const optC = r.options?.option_c;

    // Build option buttons only when not fully feasible
    let optionHTML = '';
    if (level !== 'feasible') {
        optionHTML = `
            <div class="feasibility-options">
                <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Suggested adjustments:</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    ${optA ? `<button type="button" class="btn btn-secondary btn-sm" onclick="applyFeasibilityOption('a')"
                        title="${optA.description}">📅 Extend by ${optA.extra_years} Year${optA.extra_years > 1 ? 's' : ''}</button>` : ''}
                    ${optB ? `<button type="button" class="btn btn-secondary btn-sm" onclick="applyFeasibilityOption('b')"
                        title="${optB.description}">💰 ${optB.label}</button>` : ''}
                    ${optC && optC.available ? `<button type="button" class="btn btn-secondary btn-sm" onclick="applyFeasibilityOption('c')"
                        title="${optC.description}">⚡ ${optC.label}</button>` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" style="opacity:0.6"
                        onclick="dismissFeasibilityPanel()">Keep Anyway</button>
                </div>
            </div>`;
    }

    document.getElementById('feasibilityPanel').innerHTML = `
        <div class="feasibility-panel" style="
            background:${c.bg};
            border:1px solid ${c.border};
            border-radius:10px;
            padding:14px 16px;
            margin:12px 0;
            animation: fadeIn 0.3s ease;
        ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="font-size:1rem;">${c.icon}</span>
                <strong style="color:${c.badge};font-size:0.9rem;text-transform:capitalize;">
                    Goal ${level === 'impossible' ? 'Not Feasible' : level.charAt(0).toUpperCase() + level.slice(1)}
                </strong>
            </div>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;">${r.summary}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:${level !== 'feasible' ? '12px' : '0'};">
                <div style="background:var(--glass-bg);border-radius:8px;padding:10px;text-align:center;">
                    <span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Invest in Stocks Over Time</span>
                    <strong style="font-size:1rem;color:var(--text-primary);">${formatCurrency(r.required_capital)}</strong>
                </div>
                <div style="background:var(--glass-bg);border-radius:8px;padding:10px;text-align:center;">
                    <span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Profit Needed (from ₹0)</span>
                    <strong style="font-size:1rem;color:var(--text-primary);">${formatCurrency(r.profit_needed)}</strong>
                </div>
            </div>
            ${optionHTML}
        </div>`;

    // Store result globally for applyFeasibilityOption
    window._lastFeasibilityResult = r;
}

function applyFeasibilityOption(opt) {
    const r = window._lastFeasibilityResult;
    if (!r) return;

    if (opt === 'a' && r.options.option_a) {
        document.getElementById('goalDeadline').value = r.options.option_a.new_deadline;
        showToast(`Deadline updated to ${r.options.option_a.new_deadline}`, 'success');
    } else if (opt === 'b' && r.options.option_b) {
        document.getElementById('targetAmountInput').value =
            Math.round(r.options.option_b.new_target_amount);
        showToast(`Target updated to ${formatCurrency(r.options.option_b.new_target_amount)}`, 'success');
    } else if (opt === 'c' && r.options.option_c) {
        document.getElementById('riskPreference').value = r.options.option_c.new_risk;
        showToast(`Risk level updated to ${r.options.option_c.new_risk}`, 'success');
    }

    // Re-run feasibility after applying
    runFeasibilityCheck();
}

function dismissFeasibilityPanel() {
    const panel = document.getElementById('feasibilityPanel');
    if (panel) {
        panel.innerHTML = '';
        panel.style.display = 'none';
    }
}

// Wire up feasibility triggers after DOM is ready
function attachFeasibilityListeners() {
    const fields = ['targetAmountInput', 'profitBuffer', 'goalDeadline', 'riskPreference'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', scheduleFeasibilityCheck);
            el.addEventListener('blur', scheduleFeasibilityCheck);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    attachFeasibilityListeners();
});

async function editGoal(goalId) {
    try {
        const goal = await API.Goals.get(goalId);

        document.getElementById('goalId').value = goalId;
        document.getElementById('goalName').value = goal.name;
        document.getElementById('goalDescription').value = goal.description || '';
        document.getElementById('targetAmountInput').value = goal.target_amount;
        document.getElementById('profitBuffer').value = goal.profit_buffer * 100;
        document.getElementById('goalDeadline').value = goal.deadline;
        document.getElementById('riskPreference').value = goal.risk_preference;

        document.getElementById('modalTitle').textContent = 'Edit Goal';
        document.getElementById('saveBtn').textContent = 'Update Goal';

        showModal('goalModal');

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function showDeleteModal(goalId) {
    deleteGoalId = goalId;
    showModal('deleteModal');
}

async function confirmDelete() {
    if (!deleteGoalId) return;

    try {
        await API.Goals.delete(deleteGoalId);
        showToast('Goal deleted successfully!', 'success');
        hideModal('deleteModal');
        deleteGoalId = null;
        loadGoals();

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function resetForm() {
    document.getElementById('goalForm').reset();
    document.getElementById('goalId').value = '';
    document.getElementById('modalTitle').textContent = 'Create New Goal';
    document.getElementById('saveBtn').textContent = 'Save Goal';
    setMinDeadlineDate();
    dismissFeasibilityPanel();
    window._lastFeasibilityResult = null;
}

// Add styles for goal cards
const style = document.createElement('style');
style.textContent = `
    .goals-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: var(--spacing-lg);
    }
    
    .goal-card {
        background: var(--bg-card);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-xl);
        padding: var(--spacing-lg);
        transition: all var(--transition-base);
    }
    
    .goal-card:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lg);
        border-color: var(--color-primary);
    }
    
    .goal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-lg);
    }
    
    .goal-header h3 {
        font-size: var(--font-size-xl);
        font-weight: 600;
    }
    
    .goal-progress {
        margin-bottom: var(--spacing-lg);
    }
    
    .progress-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: var(--spacing-sm);
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
    }
    
    .goal-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--spacing-md);
        margin-bottom: var(--spacing-lg);
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
    }
    
    .goal-stat {
        text-align: center;
    }
    
    .goal-stat .stat-label {
        display: block;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        margin-bottom: var(--spacing-xs);
    }
    
    .goal-stat .stat-value {
        font-size: var(--font-size-lg);
        font-weight: 600;
    }
    
    .goal-actions {
        display: flex;
        gap: var(--spacing-sm);
    }
    
    .goal-actions .btn {
        flex: 1;
        justify-content: center;
    }
    
    .empty-state, .error-state {
        text-align: center;
        padding: var(--spacing-2xl);
        color: var(--text-muted);
    }
    
    .empty-state h3 {
        margin-bottom: var(--spacing-md);
        color: var(--text-secondary);
    }
    
    .empty-state .btn {
        margin-top: var(--spacing-lg);
    }
`;
document.head.appendChild(style);

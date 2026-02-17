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

function createGoalCard(goal) {
    const progressColor = goal.progress >= 80 ? 'var(--color-accent-green)' :
        goal.progress >= 50 ? 'var(--color-accent-orange)' :
            'var(--color-primary)';

    const riskBadge = goal.risk_preference === 'high' ? 'badge-danger' :
        goal.risk_preference === 'moderate' ? 'badge-warning' : 'badge-success';

    return `
        <div class="goal-card" data-id="${goal.id}">
            <div class="goal-header">
                <h3>${goal.name}</h3>
                <span class="badge ${riskBadge}">${goal.risk_preference}</span>
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

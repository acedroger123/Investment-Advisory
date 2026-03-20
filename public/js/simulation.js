/**
 * Simulation Page JavaScript
 * Updated with Probability Gauge chart
 */

document.addEventListener('DOMContentLoaded', () => {
    loadGoals();
});

async function loadGoals() {
    try {
        const goals = await API.Goals.list();
        const select = document.getElementById('goalSelect');

        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = `${goal.name} (${formatCurrency(goal.current_value || 0)} / ${formatCurrency(goal.target_value)})`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading goals:', error);
        showToast('Could not load goals', 'error');
    }
}

async function runMonteCarloSimulation() {
    const goalId = document.getElementById('goalSelect').value;
    const runBtn = document.querySelector('button[onclick="runMonteCarloSimulation()"]');

    if (!goalId) {
        showToast('Please select a goal first', 'error');
        return;
    }

    // Show loading state on button
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.dataset.originalText = runBtn.textContent;
        runBtn.innerHTML = '<span class="spinner-small"></span> Running...';
    }
    
    // Show loading toast
    showToast('Running Monte Carlo simulation...', 'info');

    try {
        // Use 500 simulations for faster results (still statistically valid)
        const result = await API.Simulation.runMonteCarlo(goalId, 500);
        displayMonteCarloResults(result);
        showToast('Simulation complete!', 'success');

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = runBtn.dataset.originalText || 'Run Simulation';
        }
    }
}

function displayMonteCarloResults(result) {
    // Show results section, hide empty state and stress test
    document.getElementById('simulationResults').style.display = 'block';
    document.getElementById('stressTestResults').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';

    // Update metrics
    document.getElementById('successProbability').textContent = `${result.success_probability}%`;
    document.getElementById('expectedValue').textContent = formatCurrency(result.outcomes.expected);
    document.getElementById('worstCase').textContent = formatCurrency(result.outcomes.worst_case);
    document.getElementById('bestCase').textContent = formatCurrency(result.outcomes.best_case);

    // Risk level badge
    const riskEl = document.getElementById('riskLevel');
    riskEl.textContent = result.risk_level;
    riskEl.className = `risk-badge ${result.risk_level.toLowerCase()}`;

    // Simulation info
    document.getElementById('simCount').textContent = `${result.num_simulations} simulations`;
    document.getElementById('simulationDate').textContent = `Run at: ${new Date().toLocaleString()}`;
    const goalGap = Math.max((result.target_value || 0) - (result.current_value || 0), 0);

    // Goal comparison
    document.getElementById('goalComparison').innerHTML = `
        <div class="comparison-grid">
            <div class="comparison-item">
                <span class="label">Current Portfolio Value</span>
                <span class="value">${formatCurrency(result.current_value)}</span>
            </div>
            <div class="comparison-item">
                <span class="label">Target Value</span>
                <span class="value">${formatCurrency(result.target_value)}</span>
            </div>
            <div class="comparison-item">
                <span class="label">Gap to Goal</span>
                <span class="value ${goalGap > 0 ? 'text-warning' : 'text-success'}">${formatCurrency(goalGap)}</span>
            </div>
            <div class="comparison-item">
                <span class="label">Days Remaining</span>
                <span class="value">${result.days_to_deadline}</span>
            </div>
        </div>
    `;

    // Disclaimer
    document.getElementById('disclaimerText').textContent = result.disclaimer;

    // Create histogram chart
    if (result.histogram) {
        Charts.createHistogramChart('histogramChart', result.histogram, result.target_value);
    }

    // Create probability gauge (NEW!)
    Charts.createProbabilityGauge('probabilityGauge', result.success_probability, result.risk_level || 'Moderate');

    renderSimulationAssumptions(result);
}

function ensureSimulationAssumptionsContainer() {
    const resultsEl = document.getElementById('simulationResults');
    if (!resultsEl) return null;

    let assumptionsEl = document.getElementById('simulationAssumptions');
    if (assumptionsEl) return assumptionsEl;

    assumptionsEl = document.createElement('div');
    assumptionsEl.id = 'simulationAssumptions';
    assumptionsEl.style.display = 'none';
    assumptionsEl.style.marginBottom = 'var(--spacing-xl)';

    const targetNode = document.getElementById('goalComparison')?.closest('.data-card');
    if (targetNode && targetNode.parentNode) {
        targetNode.parentNode.insertBefore(assumptionsEl, targetNode);
    } else {
        resultsEl.appendChild(assumptionsEl);
    }

    return assumptionsEl;
}

function renderSimulationAssumptions(result) {
    const assumptionsEl = ensureSimulationAssumptionsContainer();
    if (!assumptionsEl) return;

    if (result.assumed_annual_return == null || result.assumed_annual_volatility == null) {
        assumptionsEl.style.display = 'none';
        assumptionsEl.innerHTML = '';
        return;
    }

    const riskColors = { low: '#10b981', moderate: '#f59e0b', high: '#ef4444' };
    const color = riskColors[result.risk_preference] || 'var(--color-primary)';

    assumptionsEl.style.display = 'block';
    assumptionsEl.innerHTML = `
        <div class="data-card">
            <div class="card-header">
                <h3>Simulation Assumptions</h3>
            </div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;padding:var(--spacing-md);">
                <span style="color:var(--text-secondary);">Risk Profile: <strong>${(result.risk_preference || 'moderate').toUpperCase()}</strong></span>
                <span>Expected Return: <strong style="color:${color};">${result.assumed_annual_return}% / year</strong></span>
                <span>Volatility: <strong style="color:${color};">${result.assumed_annual_volatility}% / year</strong></span>
            </div>
        </div>
    `;
}

async function runStressTest() {
    const goalId = document.getElementById('goalSelect').value;

    if (!goalId) {
        showToast('Please select a goal first', 'error');
        return;
    }

    showToast('Running stress test...', 'info');

    try {
        const result = await API.Simulation.runStressTest(goalId);
        displayStressTestResults(result);
        showToast('Stress test complete!', 'success');

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function displayStressTestResults(result) {
    // Show stress test section, hide others
    document.getElementById('stressTestResults').style.display = 'block';
    document.getElementById('simulationResults').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';

    // Populate table
    const tbody = document.querySelector('#stressTable tbody');
    tbody.innerHTML = result.stress_test_results.map(scenario => `
        <tr>
            <td><strong>${scenario.scenario}</strong></td>
            <td>${formatCurrency(scenario.original_value)}</td>
            <td class="text-warning">${formatCurrency(scenario.stressed_value)}</td>
            <td class="text-danger">-${formatCurrency(scenario.loss)}</td>
            <td>${scenario.new_progress.toFixed(1)}%</td>
            <td>${scenario.estimated_delay_days > 0 ? `+${scenario.estimated_delay_days} days` : 'N/A'}</td>
        </tr>
    `).join('');

    // Recommendation
    document.getElementById('stressRecommendation').innerHTML = `
        <div class="recommendation-box">
            <strong>Recommendation:</strong>
            <p>${result.recommendation}</p>
        </div>
    `;

    // Create stress chart
    Charts.createStressTestChart('stressChart', result.stress_test_results);
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-xl);
    }
    
    .results-header h2 {
        font-size: var(--font-size-2xl);
    }
    
    .simulation-date {
        color: var(--text-muted);
        font-size: var(--font-size-sm);
    }
    
    .comparison-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--spacing-lg);
    }
    
    .comparison-item {
        display: flex;
        flex-direction: column;
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
    }
    
    .comparison-item .label {
        font-size: var(--font-size-sm);
        color: var(--text-muted);
        margin-bottom: var(--spacing-xs);
    }
    
    .comparison-item .value {
        font-size: var(--font-size-xl);
        font-weight: 600;
    }
    
    .disclaimer-box {
        margin-top: var(--spacing-xl);
        padding: var(--spacing-lg);
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: var(--radius-lg);
    }
    
    .disclaimer-box p {
        margin-top: var(--spacing-sm);
        color: var(--text-secondary);
    }
    
    .recommendation-box {
        margin-top: var(--spacing-lg);
        padding: var(--spacing-lg);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        border-left: 4px solid var(--color-primary);
    }
    
    .recommendation-box p {
        margin-top: var(--spacing-sm);
        color: var(--text-secondary);
    }
    
    .empty-state {
        text-align: center;
        padding: var(--spacing-2xl);
    }
    
    .empty-content {
        max-width: 500px;
        margin: 0 auto;
    }
    
    .empty-content h3 {
        font-size: var(--font-size-2xl);
        margin-bottom: var(--spacing-md);
    }
    
    .empty-content p {
        color: var(--text-secondary);
        margin-bottom: var(--spacing-sm);
    }
    
    .gauge-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--spacing-xl);
    }
    
    .probability-gauge-wrapper {
        max-width: 300px;
        height: 200px;
        margin: 0 auto;
    }
    
    /* Button loading state */
    .spinner-small {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-right: 6px;
        vertical-align: middle;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);

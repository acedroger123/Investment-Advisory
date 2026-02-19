/**
 * API Client for Stock Portfolio Advisory System
 * Per-goal stock allocation mode
 */

// All portfolio analysis API calls go through the Node.js proxy
// Node.js at :3000 proxies /pa-api/* → FastAPI at :8005/api/*
const API_BASE_URL = '/pa-api';

/**
 * Generic API request handler
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

/**
 * Goals API
 */
const GoalsAPI = {
    async list() {
        return apiRequest('/goals');
    },

    async get(goalId) {
        return apiRequest(`/goals/${goalId}`);
    },

    async create(goalData) {
        return apiRequest('/goals', {
            method: 'POST',
            body: JSON.stringify(goalData),
        });
    },

    async update(goalId, goalData) {
        return apiRequest(`/goals/${goalId}`, {
            method: 'PUT',
            body: JSON.stringify(goalData),
        });
    },

    async delete(goalId) {
        return apiRequest(`/goals/${goalId}`, {
            method: 'DELETE',
        });
    },

    async assessFeasibility(goalData) {
        const response = await fetch('/api/assess-goal-feasibility', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(goalData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    },
};

/**
 * Transactions API (Per-Goal)
 */
const TransactionsAPI = {
    // List transactions, optionally filtered by goal
    async list(goalId = null, limit = 50) {
        const params = new URLSearchParams();
        if (goalId) params.append('goal_id', goalId);
        params.append('limit', limit);
        return apiRequest(`/transactions?${params}`);
    },

    async get(transactionId) {
        return apiRequest(`/transactions/${transactionId}`);
    },

    // Create transaction - goal_id is required
    async create(transactionData) {
        return apiRequest('/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionData),
        });
    },

    async delete(transactionId) {
        return apiRequest(`/transactions/${transactionId}`, {
            method: 'DELETE',
        });
    },
};

/**
 * Portfolio API (Per-Goal)
 */
const PortfolioAPI = {
    // Goal-specific portfolio
    async get(goalId) {
        return apiRequest(`/portfolio/${goalId}`);
    },

    async getHoldings(goalId) {
        return apiRequest(`/portfolio/${goalId}/holdings`);
    },

    async getValue(goalId) {
        return apiRequest(`/portfolio/${goalId}/value`);
    },

    async getAllocation(goalId) {
        return apiRequest(`/portfolio/${goalId}/allocation`);
    },

    async getHistory(goalId, days = 30) {
        return apiRequest(`/portfolio/${goalId}/history?days=${days}`);
    },

    async getDrawdown(goalId, days = 90) {
        return apiRequest(`/portfolio/${goalId}/drawdown?days=${days}`);
    },

    async getRiskMetrics(goalId) {
        return apiRequest(`/portfolio/${goalId}/risk`);
    },

    async getPerformance(goalId) {
        return apiRequest(`/portfolio/${goalId}/performance`);
    },

    async getRequiredGrowth(goalId) {
        return apiRequest(`/portfolio/${goalId}/required-growth`);
    },
};

/**
 * Stocks API
 */
const StocksAPI = {
    async search(query, limit = 10) {
        return apiRequest(`/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    },

    async getInfo(symbol) {
        return apiRequest(`/stocks/${encodeURIComponent(symbol)}/info`);
    },

    async getPrice(symbol) {
        return apiRequest(`/stocks/${encodeURIComponent(symbol)}/price`);
    },

    async getHistory(symbol, startDate = null, endDate = null) {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const queryString = params.toString();
        return apiRequest(`/stocks/${encodeURIComponent(symbol)}/history${queryString ? '?' + queryString : ''}`);
    },

    async validatePrice(symbol, date, price) {
        return apiRequest(`/stocks/validate?symbol=${encodeURIComponent(symbol)}&transaction_date=${date}&price=${price}`);
    },
};

/**
 * Recommendations API
 */
const RecommendationsAPI = {
    async get(goalId) {
        return apiRequest(`/recommendations/${goalId}`);
    },

    async getRebalancing(goalId) {
        return apiRequest(`/recommendations/${goalId}/rebalance`);
    },

    async getBuySuggestions(goalId) {
        return apiRequest(`/recommendations/${goalId}/buy-suggestions`);
    },

    async getAlerts(goalId) {
        return apiRequest(`/recommendations/${goalId}/alerts`);
    },

    async markAlertRead(alertId) {
        return apiRequest(`/recommendations/alerts/${alertId}/read`, {
            method: 'PUT',
        });
    },
};

/**
 * Simulation API
 */
const SimulationAPI = {
    async runMonteCarlo(goalId, numSimulations = 1000) {
        return apiRequest(`/simulation/${goalId}/monte-carlo`, {
            method: 'POST',
            body: JSON.stringify({ num_simulations: numSimulations }),
        });
    },

    async runStressTest(goalId) {
        return apiRequest(`/simulation/${goalId}/stress-test`, {
            method: 'POST',
        });
    },
};

/**
 * Insights API (Node backend integrations)
 */
const InsightsAPI = {
    async getHabitGoalConflict() {
        const response = await fetch('/api/habit-goalconflict', {
            credentials: 'include',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    },
};

/**
 * Utility Functions
 */
function formatCurrency(value, currency = 'INR') {
    if (value === null || value === undefined) return '₹0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0,
    }).format(value);
}

function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: decimals,
    }).format(value);
}

function formatPercent(value, decimals = 2) {
    if (value === null || value === undefined) return '0%';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

function formatDate(dateString) {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideUp 0.3s ease;
        font-weight: 500;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Get current date as ISO string
function getTodayISO() {
    return new Date().toISOString().split('T')[0];
}

// Get date N days ago as ISO string
function getDaysAgoISO(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

// Export for use in other scripts
window.API = {
    Goals: GoalsAPI,
    Transactions: TransactionsAPI,
    Portfolio: PortfolioAPI,
    Stocks: StocksAPI,
    Recommendations: RecommendationsAPI,
    Simulation: SimulationAPI,
    Insights: InsightsAPI,
};

window.formatCurrency = formatCurrency;
window.formatNumber = formatNumber;
window.formatPercent = formatPercent;
window.formatDate = formatDate;
window.showToast = showToast;
window.showModal = showModal;
window.hideModal = hideModal;
window.getTodayISO = getTodayISO;
window.getDaysAgoISO = getDaysAgoISO;

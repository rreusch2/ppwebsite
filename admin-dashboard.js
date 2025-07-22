// Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.backendUrl = null;
        this.authToken = null;
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalUsers = 0;
        this.filters = {
            search: '',
            tier: '',
            plan: '',
            sortBy: 'created_at_desc'
        };
        this.charts = {};
        
        this.init();
    }

    async init() {
        // Check authentication
        if (!this.checkAuth()) {
            window.location.href = 'admin-login.html';
            return;
        }

        // Initialize backend connection
        this.initBackend();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadDashboardData();
        
        // Setup auto-refresh
        this.setupAutoRefresh();
    }

    checkAuth() {
        return sessionStorage.getItem('adminAuthenticated') === 'true';
    }

    initBackend() {
        // Use Railway backend API instead of direct Supabase
        this.backendUrl = 'https://zooming-rebirth-production-a305.up.railway.app';
        this.authToken = 'Bearer admin-pplay12345';
    }

    setupEventListeners() {
        // Header actions
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadDashboardData());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Search and filters
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debounceSearch();
        });

        document.getElementById('tierFilter').addEventListener('change', (e) => {
            this.filters.tier = e.target.value;
            this.loadUsers();
        });

        document.getElementById('planFilter').addEventListener('change', (e) => {
            this.filters.plan = e.target.value;
            this.loadUsers();
        });

        document.getElementById('sortBy').addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.loadUsers();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());

        // Modal
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('userModal')) {
                this.closeModal();
            }
        });
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.currentPage = 1;
            this.loadUsers();
        }, 500);
    }

    async loadDashboardData() {
        try {
            document.getElementById('refreshBtn').innerHTML = '<span class="spinner"></span> Loading...';
            
            await Promise.all([
                this.loadSummaryStats(),
                this.loadUsers(),
                this.loadCharts()
            ]);

            this.updateLastUpdated();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showError('Failed to load dashboard data');
        } finally {
            document.getElementById('refreshBtn').innerHTML = '🔄 Refresh';
        }
    }

    async loadSummaryStats() {
        try {
            const response = await fetch(`${this.backendUrl}/api/admin/stats`, {
                headers: {
                    'Authorization': this.authToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const stats = await response.json();

            // Update UI
            document.getElementById('totalUsers').textContent = stats.totalUsers.toLocaleString();
            document.getElementById('proUsers').textContent = stats.proUsers.toLocaleString();
            document.getElementById('weeklySubs').textContent = stats.weeklySubs.toLocaleString();
            document.getElementById('monthlySubs').textContent = stats.monthlySubs.toLocaleString();
            document.getElementById('yearlySubs').textContent = stats.yearlySubs.toLocaleString();
            document.getElementById('lifetimeSubs').textContent = stats.lifetimeSubs.toLocaleString();
            document.getElementById('monthlyRevenue').textContent = `$${stats.monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('newUsers7d').textContent = stats.newUsers7d.toLocaleString();

            // Show growth change if available
            const growthElement = document.getElementById('newUsersChange');
            if (stats.userGrowthChange !== undefined) {
                const changeClass = stats.userGrowthChange >= 0 ? 'positive' : 'negative';
                const changeSymbol = stats.userGrowthChange >= 0 ? '+' : '';
                growthElement.textContent = `${changeSymbol}${stats.userGrowthChange}%`;
                growthElement.className = `card-change ${changeClass}`;
            }

            // Store for pagination
            this.totalUsers = stats.totalUsers;

        } catch (error) {
            console.error('Error loading summary stats:', error);
            this.showError('Failed to load summary statistics');
        }
    }

    async loadUsers() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage.toString(),
                pageSize: this.pageSize.toString(),
                search: this.filters.search,
                tier: this.filters.tier,
                plan: this.filters.plan,
                sortBy: this.filters.sortBy
            });

            const response = await fetch(`${this.backendUrl}/api/admin/users?${params}`, {
                headers: {
                    'Authorization': this.authToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            this.renderUsers(result.users);
            this.updatePagination(result.totalCount);

        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Failed to load users');
        }
    }

    renderUsers(users) {
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            
            // Format dates
            const joinedDate = new Date(user.created_at).toLocaleDateString();
            const expiresDate = user.subscription_expires_at 
                ? new Date(user.subscription_expires_at).toLocaleDateString()
                : '--';

            // User avatar initials
            const initials = user.username 
                ? user.username.substring(0, 2).toUpperCase()
                : user.email ? user.email.substring(0, 2).toUpperCase() : '??';

            // Status badge
            let statusClass = 'inactive';
            let statusText = 'Inactive';
            
            if (user.subscription_status === 'active') {
                statusClass = 'active';
                statusText = 'Active';
            } else if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date()) {
                statusClass = 'expired';
                statusText = 'Expired';
            }

            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${initials}</div>
                        <div class="user-details">
                            <h4>${user.username || 'No username'}</h4>
                            <span>ID: ${user.id.substring(0, 8)}...</span>
                        </div>
                    </div>
                </td>
                <td>${user.email || '--'}</td>
                <td><span class="tier-badge ${user.subscription_tier}">${user.subscription_tier || 'free'}</span></td>
                <td>${user.subscription_plan_type ? `<span class="plan-badge ${user.subscription_plan_type}">${user.subscription_plan_type}</span>` : '--'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${expiresDate}</td>
                <td>${joinedDate}</td>
                <td><button class="action-btn" onclick="adminDashboard.viewUser('${user.id}')">View</button></td>
            `;

            tbody.appendChild(row);
        });
    }

    updatePagination(totalCount) {
        const totalPages = Math.ceil(totalCount / this.pageSize);
        
        document.getElementById('pageInfo').textContent = `Page ${this.currentPage} of ${totalPages}`;
        document.getElementById('prevPage').disabled = this.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;
    }

    async viewUser(userId) {
        try {
            const response = await fetch(`${this.backendUrl}/api/admin/users/${userId}`, {
                headers: {
                    'Authorization': this.authToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const user = await response.json();
            this.showUserModal(user);
        } catch (error) {
            console.error('Error loading user details:', error);
            this.showError('Failed to load user details');
        }
    }

    showUserModal(user) {
        const modal = document.getElementById('userModal');
        const modalBody = document.getElementById('userModalBody');

        const formatDate = (date) => date ? new Date(date).toLocaleString() : '--';
        const formatArray = (arr) => arr && arr.length > 0 ? arr.join(', ') : '--';

        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div>
                    <h4 style="margin-bottom: 15px; color: #333;">Basic Information</h4>
                    <p><strong>ID:</strong> ${user.id}</p>
                    <p><strong>Username:</strong> ${user.username || '--'}</p>
                    <p><strong>Email:</strong> ${user.email || '--'}</p>
                    <p><strong>Joined:</strong> ${formatDate(user.created_at)}</p>
                    <p><strong>Last Updated:</strong> ${formatDate(user.updated_at)}</p>
                    <p><strong>Active:</strong> ${user.is_active ? 'Yes' : 'No'}</p>
                </div>
                
                <div>
                    <h4 style="margin-bottom: 15px; color: #333;">Subscription</h4>
                    <p><strong>Tier:</strong> <span class="tier-badge ${user.subscription_tier}">${user.subscription_tier || 'free'}</span></p>
                    <p><strong>Plan Type:</strong> ${user.subscription_plan_type || '--'}</p>
                    <p><strong>Status:</strong> <span class="status-badge ${user.subscription_status || 'inactive'}">${user.subscription_status || 'inactive'}</span></p>
                    <p><strong>Expires:</strong> ${formatDate(user.subscription_expires_at)}</p>
                    <p><strong>Started:</strong> ${formatDate(user.subscription_started_at)}</p>
                    <p><strong>Auto Renew:</strong> ${user.auto_renew_enabled ? 'Yes' : 'No'}</p>
                </div>
                
                <div>
                    <h4 style="margin-bottom: 15px; color: #333;">Preferences</h4>
                    <p><strong>Risk Tolerance:</strong> ${user.risk_tolerance || '--'}</p>
                    <p><strong>Favorite Teams:</strong> ${formatArray(user.favorite_teams)}</p>
                    <p><strong>Favorite Players:</strong> ${formatArray(user.favorite_players)}</p>
                    <p><strong>Preferred Sports:</strong> ${formatArray(user.preferred_sports)}</p>
                    <p><strong>Preferred Bet Types:</strong> ${formatArray(user.preferred_bet_types)}</p>
                </div>
                
                <div>
                    <h4 style="margin-bottom: 15px; color: #333;">System</h4>
                    <p><strong>Welcome Bonus:</strong> ${user.welcome_bonus_claimed ? 'Claimed' : 'Not claimed'}</p>
                    <p><strong>Bonus Expires:</strong> ${formatDate(user.welcome_bonus_expires_at)}</p>
                    <p><strong>Push Token:</strong> ${user.push_token ? 'Set' : 'Not set'}</p>
                    <p><strong>Admin Role:</strong> ${user.admin_role ? 'Yes' : 'No'}</p>
                    <p><strong>RevenueCat ID:</strong> ${user.revenuecat_customer_id || '--'}</p>
                </div>
            </div>
        `;

        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('userModal').style.display = 'none';
    }

    async loadCharts() {
        try {
            // User growth chart
            await this.loadUserGrowthChart();
            
            // Subscription distribution chart
            await this.loadSubscriptionChart();
        } catch (error) {
            console.error('Error loading charts:', error);
        }
    }

    async loadUserGrowthChart() {
        try {
            const response = await fetch(`${this.backendUrl}/api/admin/charts/user-growth`, {
                headers: {
                    'Authorization': this.authToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const chartData = await response.json();

            const ctx = document.getElementById('userGrowthChart').getContext('2d');
            this.charts.userGrowth = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'New Users',
                        data: chartData.data,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error loading user growth chart:', error);
        }
    }

    async loadSubscriptionChart() {
        try {
            const response = await fetch(`${this.backendUrl}/api/admin/charts/subscription-distribution`, {
                headers: {
                    'Authorization': this.authToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const chartData = await response.json();

            const ctx = document.getElementById('subscriptionChart').getContext('2d');
            this.charts.subscription = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        data: chartData.data,
                        backgroundColor: [
                            '#e3f2fd',
                            '#fff3e0'
                        ],
                        borderColor: [
                            '#1976d2',
                            '#f57c00'
                        ],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error loading subscription chart:', error);
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadUsers();
        }
    }

    nextPage() {
        this.currentPage++;
        this.loadUsers();
    }

    updateLastUpdated() {
        document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    }

    setupAutoRefresh() {
        // Refresh every 5 minutes
        setInterval(() => {
            this.loadSummaryStats();
        }, 5 * 60 * 1000);
    }

    showError(message) {
        // Simple error display - you could enhance this with a proper notification system
        alert(`Error: ${message}`);
    }

    logout() {
        sessionStorage.removeItem('adminAuthenticated');
        window.location.href = 'admin-login.html';
    }
}

// Initialize dashboard when page loads
let adminDashboard;
document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();
});

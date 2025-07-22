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
        // Use Supabase Admin directly - fuck the backend complications
        const SUPABASE_URL = 'https://iriaegoipkjtktitpary.supabase.co';
        const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyaWFlZ29pcGtqdGt0aXRwYXJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODkxMTQzMiwiZXhwIjoyMDY0NDg3NDMyfQ.7gTP9UGDkNfIL2jatdP5xSLADJ29KZ1cRb2RGh20kE0';
        
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
            
            // Load data with individual error handling
            const results = await Promise.allSettled([
                this.loadSummaryStats(),
                this.loadUsers(this.currentPage, this.filters.search, this.filters.tier, this.filters.plan, this.filters.sortBy),
                this.loadCharts()
            ]);

            // Check if any critical operations failed
            const failedOperations = results.filter(result => result.status === 'rejected');
            
            if (failedOperations.length === results.length) {
                // All operations failed
                this.showError('Failed to load dashboard data');
            } else if (failedOperations.length > 0) {
                // Some operations failed, but don't show error if stats loaded successfully
                console.warn('Some dashboard operations failed:', failedOperations);
            }

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
            // Get all users directly from Supabase
            const { data: users, error } = await this.supabase
                .from('profiles')
                .select('subscription_tier, subscription_plan_type, subscription_status, created_at');

            if (error) throw error;

            // Calculate stats
            const totalUsers = users.length;
            const proUsers = users.filter(u => u.subscription_tier === 'pro').length;
            const freeUsers = users.filter(u => u.subscription_tier === 'free').length;
            
            // Active subscription counts
            const activeUsers = users.filter(u => u.subscription_status === 'active');
            const weeklySubs = activeUsers.filter(u => u.subscription_plan_type === 'weekly').length;
            const monthlySubs = activeUsers.filter(u => u.subscription_plan_type === 'monthly').length;
            const yearlySubs = activeUsers.filter(u => u.subscription_plan_type === 'yearly').length;
            const lifetimeSubs = activeUsers.filter(u => u.subscription_plan_type === 'lifetime').length;

            // Calculate revenue
            const monthlyRevenue = (weeklySubs * 12.49 * 4.33) + (monthlySubs * 24.99) + (yearlySubs * 199.99 / 12) + (lifetimeSubs * 349.99 / 60);

            // New users in last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const newUsers7d = users.filter(u => new Date(u.created_at) >= sevenDaysAgo).length;

            // Update UI
            document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
            document.getElementById('proUsers').textContent = proUsers.toLocaleString();
            document.getElementById('weeklySubs').textContent = weeklySubs.toLocaleString();
            document.getElementById('monthlySubs').textContent = monthlySubs.toLocaleString();
            document.getElementById('yearlySubs').textContent = yearlySubs.toLocaleString();
            document.getElementById('lifetimeSubs').textContent = lifetimeSubs.toLocaleString();
            document.getElementById('monthlyRevenue').textContent = `$${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('newUsers7d').textContent = newUsers7d.toLocaleString();

            // Store for pagination
            this.totalUsers = totalUsers;

        } catch (error) {
            console.error('Error loading summary stats:', error);
        }
    }

    async loadUsers(page = 1, search = '', tier = '', plan = '', sortBy = 'newest') {
        try {
            let query = this.supabase
                .from('profiles')
                .select('*', { count: 'exact' });

            // Apply search filter
            if (search) {
                query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
            }

            // Apply tier filter
            if (tier) {
                query = query.eq('subscription_tier', tier);
            }

            // Apply plan filter
            if (plan) {
                query = query.eq('subscription_plan_type', plan);
            }

            // Apply sorting
            switch (sortBy) {
                case 'newest':
                    query = query.order('created_at', { ascending: false });
                    break;
                case 'oldest':
                    query = query.order('created_at', { ascending: true });
                    break;
                case 'username_asc':
                    query = query.order('username', { ascending: true });
                    break;
                case 'username_desc':
                    query = query.order('username', { ascending: false });
                    break;
                default:
                    query = query.order('created_at', { ascending: false });
            }

            // Apply pagination
            const offset = (page - 1) * this.pageSize;
            query = query.range(offset, offset + this.pageSize - 1);

            const { data: users, error, count } = await query;

            if (error) throw error;
            
            this.renderUsers(users || []);
            this.updatePagination(count || 0);
            
        } catch (error) {
            console.error('Error loading users:', error);
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
            const { data: user, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            
            this.showUserModal(user);
        } catch (error) {
            console.error('Error loading user details:', error);
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
            // Get users from last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: users, error } = await this.supabase
                .from('profiles')
                .select('created_at')
                .gte('created_at', thirtyDaysAgo.toISOString());

            if (error) throw error;

            // Process data for chart
            const dailyCounts = {};
            for (let i = 29; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                dailyCounts[dateStr] = 0;
            }

            users.forEach(user => {
                const dateStr = user.created_at.split('T')[0];
                if (dailyCounts.hasOwnProperty(dateStr)) {
                    dailyCounts[dateStr]++;
                }
            });

            const chartData = {
                labels: Object.keys(dailyCounts).map(date => new Date(date).toLocaleDateString()),
                data: Object.values(dailyCounts)
            };

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
            const { data: users, error } = await this.supabase
                .from('profiles')
                .select('subscription_tier');

            if (error) throw error;

            const tierCounts = { free: 0, pro: 0 };
            users.forEach(user => {
                const tier = user.subscription_tier || 'free';
                tierCounts[tier] = (tierCounts[tier] || 0) + 1;
            });

            const chartData = {
                labels: ['Free Users', 'Pro Users'],
                data: [tierCounts.free, tierCounts.pro]
            };

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

// Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.supabase = null;
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

        // Initialize Supabase
        this.initSupabase();
        
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

    initSupabase() {
        const SUPABASE_URL = 'https://iriaegoipkjtktitpary.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyaWFlZ29pcGtqdGt0aXRwYXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzMjc4MjAsImV4cCI6MjA1MTkwMzgyMH0.VHhHvnhJOYEHBJqfBzfqHJMKJHGFDSAQWERTYUIKLMQ';
        
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
            // Get basic user counts
            const { data: userStats, error: userError } = await this.supabase
                .from('profiles')
                .select('subscription_tier, subscription_plan_type, subscription_status, created_at')
                .eq('is_active', true);

            if (userError) throw userError;

            // Calculate stats
            const totalUsers = userStats.length;
            const proUsers = userStats.filter(u => u.subscription_tier === 'pro').length;
            const freeUsers = userStats.filter(u => u.subscription_tier === 'free').length;
            
            // Subscription plan counts
            const weeklySubs = userStats.filter(u => u.subscription_plan_type === 'weekly' && u.subscription_status === 'active').length;
            const monthlySubs = userStats.filter(u => u.subscription_plan_type === 'monthly' && u.subscription_status === 'active').length;
            const yearlySubs = userStats.filter(u => u.subscription_plan_type === 'yearly' && u.subscription_status === 'active').length;
            const lifetimeSubs = userStats.filter(u => u.subscription_plan_type === 'lifetime' && u.subscription_status === 'active').length;

            // Calculate revenue
            const monthlyRevenue = (weeklySubs * 12.49 * 4.33) + (monthlySubs * 24.99) + (yearlySubs * 199.99 / 12) + (lifetimeSubs * 349.99 / 60); // Lifetime spread over 5 years

            // New users in last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const newUsers7d = userStats.filter(u => new Date(u.created_at) >= sevenDaysAgo).length;

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

    async loadUsers() {
        try {
            let query = this.supabase
                .from('profiles')
                .select(`
                    id,
                    username,
                    email,
                    avatar_url,
                    subscription_tier,
                    subscription_plan_type,
                    subscription_status,
                    subscription_expires_at,
                    created_at,
                    is_active,
                    welcome_bonus_claimed,
                    revenuecat_customer_id
                `)
                .eq('is_active', true);

            // Apply filters
            if (this.filters.search) {
                query = query.or(`username.ilike.%${this.filters.search}%,email.ilike.%${this.filters.search}%`);
            }

            if (this.filters.tier) {
                query = query.eq('subscription_tier', this.filters.tier);
            }

            if (this.filters.plan) {
                query = query.eq('subscription_plan_type', this.filters.plan);
            }

            // Apply sorting
            const [sortField, sortDirection] = this.filters.sortBy.split('_');
            query = query.order(sortField, { ascending: sortDirection === 'asc' });

            // Apply pagination
            const from = (this.currentPage - 1) * this.pageSize;
            const to = from + this.pageSize - 1;
            query = query.range(from, to);

            const { data: users, error, count } = await query;

            if (error) throw error;

            this.renderUsers(users);
            this.updatePagination(count || 0);

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
            const { data: user, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

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
        const { data: users, error } = await this.supabase
            .from('profiles')
            .select('created_at')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Group by day for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyCounts = {};
        const labels = [];
        const data = [];

        // Initialize all days with 0
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dailyCounts[dateStr] = 0;
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }

        // Count users by day
        users.forEach(user => {
            const userDate = new Date(user.created_at);
            if (userDate >= thirtyDaysAgo) {
                const dateStr = userDate.toISOString().split('T')[0];
                if (dailyCounts[dateStr] !== undefined) {
                    dailyCounts[dateStr]++;
                }
            }
        });

        Object.values(dailyCounts).forEach(count => data.push(count));

        const ctx = document.getElementById('userGrowthChart').getContext('2d');
        this.charts.userGrowth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'New Users',
                    data: data,
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
    }

    async loadSubscriptionChart() {
        const { data: users, error } = await this.supabase
            .from('profiles')
            .select('subscription_tier, subscription_plan_type')
            .eq('is_active', true);

        if (error) throw error;

        const tierCounts = {
            'Free': users.filter(u => u.subscription_tier === 'free').length,
            'Pro': users.filter(u => u.subscription_tier === 'pro').length
        };

        const ctx = document.getElementById('subscriptionChart').getContext('2d');
        this.charts.subscription = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(tierCounts),
                datasets: [{
                    data: Object.values(tierCounts),
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

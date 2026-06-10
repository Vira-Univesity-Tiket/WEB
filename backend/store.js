
/**
 * Mock Store
 * This acts as a temporary database residing in memory (RAM).
 * Data will be lost when the server restarts.
 */

class MockStore {
    constructor() {
        this.users = [
            {
                id: 1,
                name: "علی حسینی",
                student_id: "40211890",
                national_code: "0023456789",
                balance: 1200000,
                province: "تهران",
                city: "تهران",
                language: "fa",
                avatar: ""
            }
        ];
        
        this.transactions = [
            {
                id: 'TX-1001',
                user_id: 1,
                title: 'خرید بلیط اتوبوس',
                amount: 5000,
                type: 'withdraw',
                date: '۱۴۰۲/۰۸/۱۰',
                time: '۰۸:۳۰',
                trackingNumber: 'UNI-992811'
            }
        ];
    }

    // User Methods
    findUserByStudentId(studentId) {
        return this.users.find(u => u.student_id === studentId);
    }

    createUser(user) {
        const newUser = {
            id: this.users.length + 1,
            balance: 0,
            province: 'تهران',
            city: 'تهران',
            language: 'fa',
            avatar: '',
            ...user
        };
        this.users.push(newUser);
        return newUser;
    }

    // Changed to Upsert (Update or Insert)
    updateUser(studentId, updates) {
        const index = this.users.findIndex(u => u.student_id === studentId);
        
        if (index !== -1) {
            // User exists, update it
            this.users[index] = { ...this.users[index], ...updates };
            return this.users[index];
        } else {
            // User does not exist (server restarted?), create a phantom user
            // This prevents 404 errors in dev mode when frontend has data but backend is reset
            const newUser = {
                id: this.users.length + 1,
                student_id: studentId,
                name: "کاربر بازگشتی", // Default placeholder name
                national_code: "0000000000",
                balance: 0,
                province: 'تهران',
                city: 'تهران',
                language: 'fa',
                avatar: '',
                ...updates
            };
            this.users.push(newUser);
            return newUser;
        }
    }

    // Transaction Methods
    getTransactions(userId) {
        return this.transactions.filter(t => t.user_id === userId);
    }

    addTransaction(tx) {
        this.transactions.unshift(tx);
        return tx;
    }
}

// Export a singleton instance
export const store = new MockStore();


import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parsePositiveInt } from '../validation.js';
import { getSetting, setSetting } from '../settingsStore.js';

// Helper to convert Rial to Toman
const toToman = (rial) => Math.round(Number(rial || 0) / 10);

export const handleGetFinanceData = async (req, res) => {
  const type = req.query.type; // 'student', 'driver', 'company'
  const startDate = req.query.startDate; // YYYY-MM-DD
  const endDate = req.query.endDate;     // YYYY-MM-DD
  
  const commissionPercent = await getCommissionPercent();

  try {
    let rows = [];
    
    // Base time filter query
    let dateFilter = "";
    const params = [];
    
    if (startDate) {
      dateFilter += " AND t.created_at >= ?";
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      dateFilter += " AND t.created_at <= ?";
      params.push(`${endDate} 23:59:59`);
    }

    if (type === 'student') {
      // Need to adjust query to allow injecting date filter into the JOIN context or WHERE clause correctly
      // Since 't' is transactions table alias
      const query = `
        SELECT t.id, u.name, u.student_id as identifier, t.amount, t.created_at, t.tracking_number, t.title, t.type
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE 1=1 ${dateFilter}
        ORDER BY t.created_at DESC
      `;
      
      const [results] = await db.query(query, params);
      
      rows = results.map(r => ({
        id: r.id.toString(),
        type: 'student',
        name: r.name,
        identifier: r.identifier,
        amount: toToman(r.amount), // Convert to Toman
        date: new Date(r.created_at).toLocaleDateString('fa-IR'),
        isoDate: r.created_at, // Keep ISO for charting
        trackingNumber: r.tracking_number,
        description: r.title + (r.type === 'deposit' ? ' (واریز)' : ' (برداشت)')
      }));

    } else if (type === 'driver' || type === 'company') {
      // For tickets table (t alias)
      const query = `
        SELECT t.id, d.name, d.license_plate as identifier, t.price_paid, t.created_at, t.validation_code as tracking_number
        FROM tickets t
        JOIN buses b ON b.id = t.bus_id
        JOIN drivers d ON CONCAT(d.name, ' - ', d.license_plate) = b.bus_number
        WHERE (t.status = 'active' OR t.status = 'expired')
        ${dateFilter}
        ORDER BY t.created_at DESC
      `;

      const [results] = await db.query(query, params);
      
      rows = results.map(r => {
        const fullAmount = toToman(r.price_paid);
        const companyShare = Math.round(fullAmount * (commissionPercent / 100));
        const driverShare = fullAmount - companyShare;

        return {
          id: r.id.toString(),
          type: type,
          name: r.name,
          identifier: r.identifier,
          amount: fullAmount,
          date: new Date(r.created_at).toLocaleDateString('fa-IR'),
          isoDate: r.created_at,
          trackingNumber: r.tracking_number,
          description: type === 'company' ? 'سهم شرکت از فروش بلیط' : 'فروش بلیط',
          companyShare,
          driverShare
        };
      });
    }

    res.json(rows);
  } catch (error) {
    console.error('Finance Data Error:', error);
    res.status(500).json({ error: 'Server error retrieving finance data' });
  }
};

export const handleGetSettings = async (req, res) => {
  try {
    const percent = await getCommissionPercent();
    const weeklyLimitRaw = await getSetting('weekly_wallet_topup_limit_toman');
    const weeklyWalletTopupLimitToman = weeklyLimitRaw ? Number(weeklyLimitRaw) : 0;

    const [weeklyAudit] = await db.query(
      `SELECT actor_id, created_at
       FROM audit_logs
       WHERE entity_type = 'settings' AND entity_id = 'weekly_wallet_topup_limit_toman'
       ORDER BY id DESC
       LIMIT 1`
    );

    res.json({
      companyCommissionPercent: percent,
      weeklyWalletTopupLimitToman: Number.isFinite(weeklyWalletTopupLimitToman) ? weeklyWalletTopupLimitToman : 0,
      weeklyWalletTopupLimitUpdatedAt: weeklyAudit?.[0]?.created_at || null,
      weeklyWalletTopupLimitUpdatedBy: weeklyAudit?.[0]?.actor_id || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateSettings = async (req, res) => {
  const hasCommission = req.body.companyCommissionPercent !== undefined;
  const hasWeeklyLimit = req.body.weeklyWalletTopupLimitToman !== undefined;

  if (!hasCommission && !hasWeeklyLimit) {
    return res.status(400).json({ error: 'No settings provided' });
  }

  try {
    if (hasCommission) {
      const percentValidation = parsePositiveInt(req.body.companyCommissionPercent, {
        min: 0,
        max: 100,
        error: 'Invalid percentage'
      });
      if (!percentValidation.ok) return res.status(400).json({ error: percentValidation.error });
      const companyCommissionPercent = percentValidation.value;

      await db.query(
        `INSERT INTO settings (setting_key, setting_value) VALUES ('commission_percent', ?)
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [companyCommissionPercent.toString(), companyCommissionPercent.toString()]
      );
      await auditLog(db, req, 'admin.settings_update', 'settings', 'commission_percent', { companyCommissionPercent });
    }

    if (hasWeeklyLimit) {
      const weeklyLimitValidation = parsePositiveInt(req.body.weeklyWalletTopupLimitToman, {
        min: 0,
        max: Number(process.env.MAX_WEEKLY_WALLET_TOPUP_LIMIT_TOMAN || 500000000),
        error: 'INVALID_WEEKLY_LIMIT'
      });
      if (!weeklyLimitValidation.ok) return res.status(400).json({ error: weeklyLimitValidation.error });
      const weeklyWalletTopupLimitToman = weeklyLimitValidation.value;

      await setSetting('weekly_wallet_topup_limit_toman', weeklyWalletTopupLimitToman.toString());
      await auditLog(db, req, 'admin.settings_update', 'settings', 'weekly_wallet_topup_limit_toman', { weeklyWalletTopupLimitToman });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Internal Helper
async function getCommissionPercent() {
  const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'commission_percent' LIMIT 1");
  return rows.length > 0 ? Number(rows[0].setting_value) : 10; // Default 10%
}

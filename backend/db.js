
import mysql from 'mysql2/promise';
import path from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { hashPassword } from './security.js';
import { loadBackendEnv } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadBackendEnv();

const sanitizeDbError = (err) => ({
  code: String(err?.code || 'UNKNOWN_DB_ERROR'),
  errno: Number(err?.errno || 0) || undefined,
  sqlState: err?.sqlState ? String(err.sqlState) : undefined,
  message: String(err?.message || 'Database error')
});

let lastDbError = null;

export const getLastDbError = () => lastDbError;

export const probeDb = async () => {
  try {
    await db.query('SELECT 1');
    lastDbError = null;
    return { ok: true };
  } catch (err) {
    lastDbError = sanitizeDbError(err);
    return { ok: false, error: lastDbError };
  }
};

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`[WARN] Missing environment variable: ${key}`);
  }
}

export const db = mysql.createPool({
  host: process.env.DB_HOST?.trim(),
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER?.trim(),
  password: process.env.DB_PASSWORD?.trim(),
  database: process.env.DB_NAME?.trim(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true,
  charset: 'utf8mb4',
  timezone: '+03:30'
});

console.info(
  `[DB CONFIG] host=${String(process.env.DB_HOST || '').trim() || 'MISSING'} port=${Number(process.env.DB_PORT || 3306)} db=${String(process.env.DB_NAME || '').trim() || 'MISSING'}`
);

// Keep SQL date boundaries consistent with the university service day.
db.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+03:30'");
});

// Database Initialization & Migration Script
export const initDB = async () => {
  let conn;
  try {
    conn = await db.getConnection();
    console.log(`✅ Successfully connected to database: ${process.env.DB_NAME}`);

    const dbName = process.env.DB_NAME?.trim();
    const schemaPath = path.resolve(__dirname, 'db_schema.sql');
    const schemaSql = (await readFile(schemaPath, 'utf8'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const schemaStatements = schemaSql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement && !statement.toUpperCase().startsWith('SET '));

    for (const statement of schemaStatements) {
      await conn.query(statement);
    }
    if (process.env.SEED_DEMO_DATA === 'true' && !['production'].includes(String(process.env.BACKEND_NODE_ENV || process.env.NODE_ENV))) {
      const demoSql = await readFile(path.resolve(__dirname, 'demo_seed.sql'), 'utf8');
      for (const statement of demoSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(item => item.trim()).filter(Boolean)) {
        await conn.query(statement);
      }
    }
    console.log('✅ Base database schema applied.');

    // Helper to check if a column exists
    const checkColumn = async (table, col) => {
      const [rows] = await conn.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [dbName, table, col]
      );
      return rows[0].count > 0;
    };

    // --- DRIVERS TABLE MIGRATION ---
    if (!(await checkColumn('drivers', 'username'))) {
      console.log('⚡ Migrating: Adding "username" to drivers table...');
      await conn.query('ALTER TABLE drivers ADD COLUMN username VARCHAR(50) NOT NULL UNIQUE AFTER name');
    }
    if (!(await checkColumn('drivers', 'password'))) {
      console.log('⚡ Migrating: Adding "password" to drivers table...');
      await conn.query('ALTER TABLE drivers ADD COLUMN password VARCHAR(255) NOT NULL AFTER username');
    }
    if (!(await checkColumn('drivers', 'capacity'))) {
      console.log('⚡ Migrating: Adding "capacity" to drivers table...');
      await conn.query('ALTER TABLE drivers ADD COLUMN capacity INT NOT NULL DEFAULT 30 AFTER status');
    }
    
    // Check for registration fields
    if (!(await checkColumn('drivers', 'national_code'))) {
      console.log('⚡ Migrating: Adding registration fields to drivers table...');
      await conn.query(`ALTER TABLE drivers 
        ADD COLUMN national_code VARCHAR(20) DEFAULT NULL,
        ADD COLUMN birth_date VARCHAR(20) DEFAULT NULL,
        ADD COLUMN plate_data JSON DEFAULT NULL,
        ADD COLUMN documents JSON DEFAULT NULL,
        ADD COLUMN rejection_reason TEXT DEFAULT NULL
      `);
      // Update status enum to include pending/rejected
      await conn.query("ALTER TABLE drivers MODIFY COLUMN status ENUM('active','inactive','pending','rejected') NOT NULL DEFAULT 'pending'");
    }

    // --- USERS TABLE MIGRATION ---
    if (!(await checkColumn('users', 'status'))) {
      console.log('⚡ Migrating: Adding "status" to users table...');
      await conn.query("ALTER TABLE users ADD COLUMN status ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER city");
    }

    // Enforce stricter constraints for student_id and national_code when existing data is compatible.
    try {
      const [invalidRows] = await conn.query(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE student_id IS NULL OR student_id NOT REGEXP '^[0-9]{9}$'
            OR national_code IS NULL OR national_code NOT REGEXP '^[0-9]{10}$'`
      );
      const invalidCount = Number(invalidRows?.[0]?.count || 0);
      if (invalidCount === 0) {
        console.log('⚡ Migrating: Enforcing users identifiers length constraints...');
        await conn.query("ALTER TABLE users MODIFY COLUMN student_id CHAR(9) NOT NULL");
        await conn.query("ALTER TABLE users MODIFY COLUMN national_code CHAR(10) NOT NULL");
        // Best-effort CHECK constraints (MySQL 8+). Ignore if not supported or already exists.
        try {
          await conn.query("ALTER TABLE users ADD CONSTRAINT chk_users_student_id CHECK (student_id REGEXP '^[0-9]{9}$')");
        } catch {}
        try {
          await conn.query("ALTER TABLE users ADD CONSTRAINT chk_users_national_code CHECK (national_code REGEXP '^[0-9]{10}$')");
        } catch {}
      } else {
        console.warn(`⚠️ Skipping strict DB constraints for users (found ${invalidCount} invalid rows). Validation remains enforced server-side.`);
      }
    } catch (e) {
      console.warn('⚠️ Users constraints migration skipped:', e.message);
    }

    // --- TICKETS TABLE MIGRATION (CRITICAL FIX) ---
    // Ensure validation_code exists for 4-digit QR logic
    if (!(await checkColumn('tickets', 'validation_code'))) {
      console.log('⚡ Migrating: Adding "validation_code" to tickets table...');
      await conn.query('ALTER TABLE tickets ADD COLUMN validation_code CHAR(4) NOT NULL DEFAULT "0000" AFTER qr_code');
      // Update existing records with random codes
      await conn.query('UPDATE tickets SET validation_code = FLOOR(1000 + RAND() * 9000) WHERE validation_code = "0000"');
      await conn.query('CREATE INDEX idx_tickets_validation_code ON tickets(validation_code)');
    }

    // Use SHOW INDEX to reliably find indexes on the qr_code column
    try {
        const [indexes] = await conn.query(`SHOW INDEX FROM tickets`);
        
        // Find any UNIQUE index where the column name is 'qr_code'
        // Non_unique == 0 means UNIQUE
        const uniqueQrIndexes = indexes.filter(idx => 
            idx.Column_name === 'qr_code' && 
            idx.Non_unique === 0 && 
            idx.Key_name !== 'PRIMARY' && indexes.filter(item => item.Key_name === idx.Key_name).length === 1
        );

        for (const idx of uniqueQrIndexes) {
            console.log(`⚡ Migrating: Dropping UNIQUE constraint "${idx.Key_name}" on tickets.qr_code...`);
            await conn.query(`ALTER TABLE tickets DROP INDEX \`${String(idx.Key_name).replace(/`/g, '``')}\``);
        }

        // Ensure we have a standard non-unique index for performance
        const hasQrIndex = indexes.some(idx => idx.Column_name === 'qr_code' && idx.Key_name === 'idx_tickets_qr');
        if (!hasQrIndex) {
             console.log('⚡ Migrating: Creating regular index "idx_tickets_qr" on tickets...');
             await conn.query('CREATE INDEX idx_tickets_qr ON tickets(qr_code)');
        }

    } catch (e) {
        throw new Error("Ticket QR index migration failed", { cause: e });
    }

    // --- BUSES TABLE MIGRATION (Fixes "Unknown column created_at") ---
    if (!(await checkColumn('buses', 'created_at'))) {
      console.log('⚡ Migrating: Adding "created_at" to buses table...');
      await conn.query('ALTER TABLE buses ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    if (!(await checkColumn('buses', 'schedule_id'))) {
      console.log('⚡ Migrating: Adding FK columns to buses table...');
      await conn.query(`ALTER TABLE buses
        ADD COLUMN schedule_id INT DEFAULT NULL AFTER id,
        ADD COLUMN origin_station_id INT DEFAULT NULL AFTER schedule_id,
        ADD COLUMN destination_station_id INT DEFAULT NULL AFTER origin_station_id,
        ADD INDEX idx_buses_schedule (schedule_id),
        ADD INDEX idx_buses_origin_station (origin_station_id),
        ADD INDEX idx_buses_destination_station (destination_station_id),
        ADD CONSTRAINT fk_buses_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id),
        ADD CONSTRAINT fk_buses_origin_station FOREIGN KEY (origin_station_id) REFERENCES stations(id),
        ADD CONSTRAINT fk_buses_destination_station FOREIGN KEY (destination_station_id) REFERENCES stations(id)
      `);
    }

    // Preserve the driver recorded at sale time when a recurring schedule is reassigned later.
    if (!(await checkColumn('buses', 'driver_id'))) {
      await conn.query('ALTER TABLE buses ADD COLUMN driver_id INT DEFAULT NULL AFTER schedule_id, ADD INDEX idx_buses_driver (driver_id)');
      await conn.query("UPDATE buses b JOIN drivers d ON CONCAT(d.name, ' - ', d.license_plate) = b.bus_number SET b.driver_id = d.id WHERE b.driver_id IS NULL");
    }

    // --- NOTIFICATIONS TABLE ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT NOT NULL AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'warning', 'success', 'error') NOT NULL DEFAULT 'info',
        audience ENUM('student','driver','both') NOT NULL DEFAULT 'both',
        status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await checkColumn('notifications', 'audience'))) {
      console.log('⚡ Migrating: Adding "audience" to notifications table...');
      await conn.query("ALTER TABLE notifications ADD COLUMN audience ENUM('student','driver','both') NOT NULL DEFAULT 'both' AFTER type");
    }

    // --- LEGAL CONTENTS TABLE ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS legal_contents (
        id INT NOT NULL AUTO_INCREMENT,
        audience ENUM('user','driver') NOT NULL,
        content MEDIUMTEXT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        updated_by VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_legal_audience_active (audience, is_active),
        KEY idx_legal_audience (audience, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(
      `INSERT IGNORE INTO legal_contents (id, audience, content, is_active, updated_by)
       VALUES
       (1, 'user', 'قوانین و مقررات کاربر هنوز ثبت نشده است.', 1, 'system'),
       (2, 'driver', 'قوانین و مقررات راننده هنوز ثبت نشده است.', 1, 'system')`
    );

    // --- SETTINGS TABLE CHECK ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(50) NOT NULL,
        setting_value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    await conn.query(`INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('commission_percent', '10')`);
    await conn.query(`INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('payment_topup_expiry_minutes', '20')`);
    // --- ADMIN / ANALYST ACCOUNTS ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admin_accounts (
        id INT NOT NULL AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','analyst') NOT NULL DEFAULT 'analyst',
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_by VARCHAR(50) DEFAULT NULL,
        updated_by VARCHAR(50) DEFAULT NULL,
        last_login_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_accounts_username (username),
        KEY idx_admin_accounts_role_status (role, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    const [existingAdminRows] = await conn.query(
      'SELECT id FROM admin_accounts WHERE username = ? LIMIT 1',
      [adminUsername]
    );
    if (adminUsername && adminPassword && (!existingAdminRows || existingAdminRows.length === 0)) {
      const passwordHash = await hashPassword(adminPassword);
      await conn.query(
        `INSERT INTO admin_accounts (username, password_hash, role, status, created_by, updated_by)
         VALUES (?, ?, 'admin', 'active', 'system', 'system')`,
        [adminUsername, passwordHash]
      );
    }

    // Harden legacy plaintext passwords to scrypt hashes (one-time migration).
    const [legacyAdminRows] = await conn.query(
      `SELECT id, password_hash
       FROM admin_accounts
       WHERE password_hash IS NOT NULL
         AND password_hash NOT LIKE 'scrypt$%'`
    );
    for (const row of legacyAdminRows) {
      const upgradedHash = await hashPassword(String(row.password_hash));
      await conn.query('UPDATE admin_accounts SET password_hash = ? WHERE id = ?', [upgradedHash, row.id]);
    }

    const [legacyDriverRows] = await conn.query(
      `SELECT id, password
       FROM drivers
       WHERE password IS NOT NULL
         AND password NOT LIKE 'scrypt$%'`
    );
    for (const row of legacyDriverRows) {
      const upgradedHash = await hashPassword(String(row.password));
      await conn.query('UPDATE drivers SET password = ? WHERE id = ?', [upgradedHash, row.id]);
    }

    // --- SUPPORT TICKETING TABLES ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(80) NOT NULL,
        status ENUM('open','in_progress','answered','closed') NOT NULL DEFAULT 'open',
        storage_path VARCHAR(255) NOT NULL DEFAULT '',
        closed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_tickets_user (user_id),
        KEY idx_support_tickets_status (status),
        CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id INT NOT NULL AUTO_INCREMENT,
        ticket_id INT NOT NULL,
        sender_role ENUM('user','admin') NOT NULL,
        sender_id VARCHAR(50) DEFAULT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_messages_ticket (ticket_id),
        CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_attachments (
        id INT NOT NULL AUTO_INCREMENT,
        ticket_id INT NOT NULL,
        message_id INT NOT NULL,
        original_name VARCHAR(120) NOT NULL,
        stored_name VARCHAR(140) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        size_bytes INT NOT NULL,
        rel_path VARCHAR(255) NOT NULL,
        uploader_role ENUM('user','admin') NOT NULL,
        uploader_id VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_attachments_ticket (ticket_id),
        KEY idx_support_attachments_message (message_id),
        CONSTRAINT fk_support_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        CONSTRAINT fk_support_attachments_message FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_status_history (
        id INT NOT NULL AUTO_INCREMENT,
        ticket_id INT NOT NULL,
        from_status VARCHAR(20) DEFAULT NULL,
        to_status VARCHAR(20) NOT NULL,
        actor_role VARCHAR(20) NOT NULL,
        actor_id VARCHAR(50) DEFAULT NULL,
        note VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_status_ticket (ticket_id),
        CONSTRAINT fk_support_status_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // --- DRIVER ROUTE REQUESTS (Service Program Workflow) ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_route_requests (
        id INT NOT NULL AUTO_INCREMENT,
        driver_id INT NOT NULL,
        origin_station_id INT NOT NULL,
        destination_station_id INT NOT NULL,
        departure_time TIME NOT NULL,
        price DECIMAL(10,0) NOT NULL,
        station_ids JSON DEFAULT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        admin_note VARCHAR(255) DEFAULT NULL,
        approved_schedule_id INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_driver_route_status (status),
        KEY idx_driver_route_driver (driver_id),
        CONSTRAINT fk_driver_route_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        CONSTRAINT fk_driver_route_origin FOREIGN KEY (origin_station_id) REFERENCES stations(id),
        CONSTRAINT fk_driver_route_destination FOREIGN KEY (destination_station_id) REFERENCES stations(id),
        CONSTRAINT fk_driver_route_schedule FOREIGN KEY (approved_schedule_id) REFERENCES schedules(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // --- IDEAS / FEEDBACK SYSTEM ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_ideas (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(60) DEFAULT NULL,
        status ENUM('submitted','reviewing','approved','rejected','done') NOT NULL DEFAULT 'submitted',
        admin_response TEXT DEFAULT NULL,
        admin_note VARCHAR(255) DEFAULT NULL,
        reviewed_by VARCHAR(50) DEFAULT NULL,
        reviewed_at TIMESTAMP NULL DEFAULT NULL,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_ideas_user (user_id),
        KEY idx_user_ideas_status (status),
        KEY idx_user_ideas_created_at (created_at),
        CONSTRAINT fk_user_ideas_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_idea_status_history (
        id INT NOT NULL AUTO_INCREMENT,
        idea_id INT NOT NULL,
        from_status VARCHAR(20) DEFAULT NULL,
        to_status VARCHAR(20) NOT NULL,
        actor_role ENUM('user','admin') NOT NULL,
        actor_id VARCHAR(50) DEFAULT NULL,
        note VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_idea_history_idea (idea_id),
        KEY idx_idea_history_created_at (created_at),
        CONSTRAINT fk_idea_history_idea FOREIGN KEY (idea_id) REFERENCES user_ideas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(120) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
        entity_type VARCHAR(50) DEFAULT NULL,
        entity_id VARCHAR(50) DEFAULT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_notifications_user (user_id, is_read, created_at),
        CONSTRAINT fk_user_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // --- PAYMENT TRANSACTIONS (Wallet Top-up) ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        amount DECIMAL(15,0) NOT NULL,
        status ENUM('pending','success','failed','cancelled','expired') NOT NULL DEFAULT 'pending',
        gateway VARCHAR(30) NOT NULL,
        gateway_transaction_id VARCHAR(120) DEFAULT NULL,
        reference_id VARCHAR(120) DEFAULT NULL,
        payment_url VARCHAR(500) DEFAULT NULL,
        authority VARCHAR(120) DEFAULT NULL,
        callback_payload JSON DEFAULT NULL,
        verified_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_payment_user_status_created (user_id, status, created_at),
        UNIQUE KEY uq_payment_gateway_authority (gateway, authority),
        UNIQUE KEY uq_payment_gateway_txid (gateway, gateway_transaction_id),
        CONSTRAINT fk_payment_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Database schema checks and migrations completed.');

  } catch (err) {
    lastDbError = sanitizeDbError(err);
    console.error('❌ Database Initialization Error:', err.message);
    if (lastDbError?.code) {
      console.error(`   -> DB_ERROR_CODE: ${lastDbError.code}`);
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   -> Check your DB_USER and DB_PASSWORD in .env');
    } else if (err.code === 'ENOTFOUND') {
      console.error('   -> Check your DB_HOST in .env');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   -> Check your DB_NAME in .env');
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

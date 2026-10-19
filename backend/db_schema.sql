
-- University Shuttle - Full MySQL schema (cPanel compatible)
-- Import this file in phpMyAdmin

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+03:30";

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(20) NOT NULL,
  national_code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  balance DECIMAL(15,0) DEFAULT 0,
  avatar LONGTEXT,
  language VARCHAR(5) DEFAULT 'fa',
  province VARCHAR(50) DEFAULT NULL,
  city VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_student_id (student_id),
  UNIQUE KEY uq_users_national_code (national_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stations (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drivers (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  license_plate VARCHAR(30) NOT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  status ENUM('active','inactive','pending','rejected') NOT NULL DEFAULT 'pending',
  capacity INT NOT NULL DEFAULT 30,
  national_code VARCHAR(20) DEFAULT NULL,
  birth_date VARCHAR(20) DEFAULT NULL,
  plate_data JSON DEFAULT NULL,
  documents JSON DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_drivers_username (username),
  UNIQUE KEY uq_drivers_plate (license_plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_station_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NOT NULL,
  station_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_driver_station (driver_id, station_id),
  CONSTRAINT fk_driver_station_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_station_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedules (
  id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NOT NULL,
  origin_station_id INT NOT NULL,
  destination_station_id INT NOT NULL,
  departure_time TIME NOT NULL,
  price DECIMAL(10,0) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedule_driver (driver_id),
  KEY idx_schedule_origin (origin_station_id),
  KEY idx_schedule_destination (destination_station_id),
  CONSTRAINT fk_schedule_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
  CONSTRAINT fk_schedule_origin FOREIGN KEY (origin_station_id) REFERENCES stations(id),
  CONSTRAINT fk_schedule_destination FOREIGN KEY (destination_station_id) REFERENCES stations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS buses (
  id INT NOT NULL AUTO_INCREMENT,
  schedule_id INT DEFAULT NULL,
  driver_id INT DEFAULT NULL,
  origin_station_id INT DEFAULT NULL,
  destination_station_id INT DEFAULT NULL,
  bus_number VARCHAR(80) NOT NULL,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  departure_time TIME NOT NULL,
  price DECIMAL(10,0) NOT NULL,
  total_seats INT NOT NULL DEFAULT 30,
  remaining_seats INT NOT NULL DEFAULT 30,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_buses_schedule (schedule_id),
  KEY idx_buses_driver (driver_id),
  KEY idx_buses_origin_station (origin_station_id),
  KEY idx_buses_destination_station (destination_station_id),
  CONSTRAINT fk_buses_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id),
  CONSTRAINT fk_buses_origin_station FOREIGN KEY (origin_station_id) REFERENCES stations(id),
  CONSTRAINT fk_buses_destination_station FOREIGN KEY (destination_station_id) REFERENCES stations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  bus_id INT NOT NULL,
  seat_number INT NOT NULL,
  price_paid DECIMAL(10,0) NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  qr_code VARCHAR(120) NOT NULL,
  validation_code CHAR(4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tickets_qr (qr_code),
  KEY idx_tickets_validation_code (validation_code),
  KEY idx_tickets_user (user_id),
  KEY idx_tickets_bus (bus_id),
  CONSTRAINT fk_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_bus FOREIGN KEY (bus_id) REFERENCES buses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_scans (
  id INT NOT NULL AUTO_INCREMENT,
  ticket_id INT NOT NULL,
  driver_id INT NOT NULL,
  scan_method ENUM('qr','code') NOT NULL,
  scanned_value VARCHAR(255) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  service_date DATE NOT NULL,
  scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ticket_scan_per_day (ticket_id, service_date),
  KEY idx_scans_driver_date (driver_id, service_date),
  CONSTRAINT fk_scans_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_scans_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  amount DECIMAL(15,0) NOT NULL,
  type ENUM('deposit','withdraw') NOT NULL,
  title VARCHAR(100) NOT NULL,
  tracking_number VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_user (user_id),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('commission_percent', '10');

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO legal_contents (id, audience, content, is_active, updated_by)
VALUES
  (1, 'user', 'قوانین و مقررات کاربر هنوز ثبت نشده است.', 1, 'system'),
  (2, 'driver', 'قوانین و مقررات راننده هنوز ثبت نشده است.', 1, 'system');

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT NOT NULL AUTO_INCREMENT,
  actor_role VARCHAR(20) NOT NULL,
  actor_id VARCHAR(50) DEFAULT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  details JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_role, actor_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ideas / Feedback System
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_feedback (
  ticket_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(2000) NOT NULL DEFAULT '',
  status ENUM('pending','reviewing','resolved') NOT NULL DEFAULT 'pending',
  review_note VARCHAR(2000) NOT NULL DEFAULT '',
  reviewed_by VARCHAR(50) DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id),
  KEY idx_feedback_status (status, created_at),
  CONSTRAINT fk_feedback_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_purchase_requests (
  user_id INT NOT NULL,
  request_key VARCHAR(80) CHARACTER SET ascii NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  response JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_key),
  CONSTRAINT fk_purchase_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

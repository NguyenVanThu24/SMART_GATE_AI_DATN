SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS smart_gate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_gate;
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS barrier_events, access_logs, gates, visitors, vehicles, employees, departments, accounts;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin','guard','manager') NOT NULL DEFAULT 'guard',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(15),
  email VARCHAR(100),
  department_id INT NULL,
  position VARCHAR(100),
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plate_number VARCHAR(15) NOT NULL UNIQUE,
  vehicle_type ENUM('car','motorbike','truck','other') NOT NULL DEFAULT 'car',
  brand VARCHAR(50),
  color VARCHAR(30),
  employee_id INT NULL,
  is_allowed TINYINT(1) NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_to DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE visitors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  id_number VARCHAR(20),
  phone VARCHAR(15),
  plate_number VARCHAR(15),
  host_employee_id INT NULL,
  purpose VARCHAR(255),
  visit_date DATE NOT NULL,
  time_from TIME NULL,
  time_to TIME NULL,
  status ENUM('pending','approved','rejected','done') NOT NULL DEFAULT 'pending',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE gates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  direction ENUM('in','out','both') NOT NULL DEFAULT 'both',
  camera_url VARCHAR(255),
  barrier_status ENUM('closed','open','error') NOT NULL DEFAULT 'closed',
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  gate_id INT NOT NULL,
  plate_number VARCHAR(15) NOT NULL,
  confidence DECIMAL(5,2) NULL,
  direction ENUM('in','out') NOT NULL,
  vehicle_id INT NULL,
  visitor_id INT NULL,
  result ENUM('allowed','denied','manual','pending') NOT NULL,
  reason VARCHAR(255),
  image_path VARCHAR(255),
  operator_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_id VARCHAR(36) DEFAULT NULL,
  UNIQUE KEY uq_access_logs_event_id (event_id),
  INDEX idx_plate (plate_number),
  INDEX idx_time (created_at),
  FOREIGN KEY (gate_id) REFERENCES gates(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL,
  FOREIGN KEY (operator_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE barrier_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  gate_id INT NOT NULL,
  action ENUM('open','close','error') NOT NULL,
  triggered_by ENUM('auto','manual') NOT NULL,
  account_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gate_id) REFERENCES gates(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

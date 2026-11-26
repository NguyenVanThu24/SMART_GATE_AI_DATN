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
SET NAMES utf8mb4;
USE smart_gate;

-- Mật khẩu mặc định của cả 3 tài khoản: Admin@123
INSERT INTO accounts (username,password_hash,full_name,role,last_login) VALUES
('admin','RESET','Quản trị viên','admin',NOW()),
('baove01','RESET','Hoàng Văn Dũng','guard',NOW()),
('quanly01','RESET','Đỗ Thị Lan','manager',NOW());

INSERT INTO departments (name) VALUES ('Văn phòng'),('Kế toán'),('Kỹ thuật'),('Nhân sự'),('Bảo vệ');

INSERT INTO employees (employee_code,full_name,phone,email,department_id,position,status) VALUES
('NV001','Nguyễn Văn An','0912345678','an.nv@coquan.vn',3,'Kỹ sư','active'),
('NV002','Trần Thị Bình','0987654321','binh.tt@coquan.vn',2,'Kế toán trưởng','active'),
('NV003','Lê Văn Cường','0901222333','cuong.lv@coquan.vn',1,'Chuyên viên','active'),
('NV004','Phạm Thị Dung','0934567890','dung.pt@coquan.vn',4,'Trưởng phòng','active'),
('NV005','Hoàng Văn Em','0976543210','em.hv@coquan.vn',3,'Kỹ thuật viên','active'),
('NV006','Vũ Thị Phương','0911223344','phuong.vt@coquan.vn',1,'Thư ký','inactive'),
('NV007','Đặng Quốc Gia','0922334455','gia.dq@coquan.vn',2,'Kế toán viên','active'),
('NV008','Bùi Thanh Hải','0933445566','hai.bt@coquan.vn',5,'Đội trưởng bảo vệ','active');

INSERT INTO vehicles (plate_number,vehicle_type,brand,color,employee_id,is_allowed,valid_from,valid_to) VALUES
('29A-123.45','car','Toyota','Trắng',1,1,NULL,NULL),
('29C-222.33','car','Honda','Đen',2,1,NULL,NULL),
('30G-456.78','car','Mazda','Đỏ',3,1,NULL,NULL),
('29K1-456.78','motorbike','Yamaha','Đỏ',3,1,NULL,NULL),
('30H-111.22','car','Kia','Xám',4,1,NULL,NULL),
('29B1-333.44','motorbike','Honda','Xanh',5,1,NULL,NULL),
('51G-777.88','truck','Hyundai','Trắng',NULL,1,NULL,NULL),
('29A-999.99','car','Ford','Đen',6,0,NULL,NULL),
('30E-555.12','car','VinFast','Trắng',7,1,CURDATE() - INTERVAL 90 DAY,CURDATE() - INTERVAL 10 DAY),
('29D-246.80','car','Toyota','Bạc',8,1,NULL,NULL);

INSERT INTO visitors (full_name,id_number,phone,plate_number,host_employee_id,purpose,visit_date,time_from,time_to,status,created_by) VALUES
('Phạm Minh Đức','001090123789','0905111222','30F-555.66',1,'Họp đối tác',CURDATE(),'08:00:00','17:00:00','approved',2),
('Vũ Thu Hà','001092456123','0906222333','29B-888.99',2,'Nộp hồ sơ',CURDATE(),'08:00:00','12:00:00','pending',2),
('Ngô Quang Huy','001085987654','0907333444','51F-123.45',3,'Bảo trì thiết bị',CURDATE(),'07:30:00','18:00:00','approved',2),
('Lê Hồng Nhung','001095321654','0908444555','29E-135.79',4,'Phỏng vấn',CURDATE() + INTERVAL 1 DAY,'09:00:00','11:00:00','pending',3),
('Trịnh Văn Long','001080741852','0909555666','30A-864.20',1,'Giao hàng',CURDATE() - INTERVAL 1 DAY,'08:00:00','17:00:00','done',2);

INSERT INTO gates (name,direction,camera_url,barrier_status) VALUES
('Cổng chính - Vào','in','rtsp://camera-in.local/stream','closed'),
('Cổng chính - Ra','out','rtsp://camera-out.local/stream','closed'),
('Cổng phụ','both',NULL,'closed');

INSERT INTO access_logs (gate_id,plate_number,confidence,direction,vehicle_id,visitor_id,result,reason,operator_id,created_at) VALUES
(1,'29A-123.45',97.50,'in',1,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 20 MINUTE),
(1,'30F-555.66',94.20,'in',NULL,1,'allowed','Khách đã được duyệt',NULL,NOW() - INTERVAL 35 MINUTE),
(1,'51G-999.11',88.00,'in',NULL,NULL,'denied','Biển số chưa đăng ký',NULL,NOW() - INTERVAL 50 MINUTE),
(2,'29C-222.33',96.10,'out',2,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 1 HOUR),
(1,'29A-999.99',95.30,'in',8,NULL,'denied','Xe bị khóa quyền',NULL,NOW() - INTERVAL 2 HOUR),
(1,'30G-456.78',98.00,'in',3,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 3 HOUR),
(1,'30E-555.12',93.40,'in',9,NULL,'denied','Hết hạn đăng ký',NULL,NOW() - INTERVAL 4 HOUR),
(1,'30H-111.22',61.50,'in',NULL,NULL,'manual','Bảo vệ xác nhận thủ công',2,NOW() - INTERVAL 5 HOUR),
(1,'51F-123.45',92.70,'in',NULL,3,'allowed','Khách đã được duyệt',NULL,NOW() - INTERVAL 6 HOUR),
(1,'29D-246.80',97.90,'in',10,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 1 DAY),
(2,'29D-246.80',96.80,'out',10,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 1 DAY + INTERVAL 9 HOUR),
(1,'30A-864.20',90.20,'in',NULL,5,'allowed','Khách đã được duyệt',NULL,NOW() - INTERVAL 1 DAY),
(2,'30A-864.20',91.50,'out',NULL,5,'allowed','Khách đã được duyệt',NULL,NOW() - INTERVAL 1 DAY + INTERVAL 4 HOUR),
(1,'29B1-333.44',97.00,'in',6,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 2 DAY),
(1,'29K1-456.78',96.40,'in',4,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 3 DAY),
(1,'30H-111.22',98.20,'in',5,NULL,'allowed','Xe nhân viên hợp lệ',NULL,NOW() - INTERVAL 4 DAY);

INSERT INTO barrier_events (gate_id,action,triggered_by,account_id,created_at) VALUES
(1,'open','auto',NULL,NOW() - INTERVAL 20 MINUTE),(1,'close','auto',NULL,NOW() - INTERVAL 20 MINUTE + INTERVAL 8 SECOND),
(1,'open','manual',2,NOW() - INTERVAL 5 HOUR),(1,'close','auto',NULL,NOW() - INTERVAL 5 HOUR + INTERVAL 8 SECOND);

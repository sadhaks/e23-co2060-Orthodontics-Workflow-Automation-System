-- ORTHOFLOW Database Schema
-- University Orthodontics Clinical Workflow Management System

-- Drop existing database if it exists
DROP DATABASE IF EXISTS orthoflow;

-- Create Database
CREATE DATABASE IF NOT EXISTS orthoflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE orthoflow;

-- Users Table - Authentication and Role Management
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT', 'RECEPTION') NOT NULL,
    department VARCHAR(100),
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at TIMESTAMP NULL DEFAULT NULL,
    last_login TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_patient_code (patient_code),
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_email (email),
    INDEX idx_deleted_at (deleted_at)
);

-- Patients Table - Core Patient Information
CREATE TABLE patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_code VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    address TEXT,
    province VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    nhi_verified BOOLEAN DEFAULT FALSE,
    status ENUM('ACTIVE', 'COMPLETED', 'CONSULTATION', 'MAINTENANCE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_patient_code (patient_code),
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_dob (date_of_birth),
    INDEX idx_deleted_at (deleted_at)
);

-- Visits Table - Patient Visit Records
CREATE TABLE visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    provider_id INT NOT NULL,
    visit_date DATETIME NOT NULL,
    procedure_type VARCHAR(255),
    status ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'DID_NOT_ATTEND') DEFAULT 'SCHEDULED',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_patient_id (patient_id),
    INDEX idx_provider_id (provider_id),
    INDEX idx_visit_date (visit_date),
    INDEX idx_status (status)
);

-- Patient Histories Table - Orthodontic case history records
CREATE TABLE patient_histories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    form_data JSON NULL,
    updated_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY uniq_patient_history (patient_id),
    INDEX idx_patient_history_patient (patient_id)
);

-- Medical Documents Table - File Uploads (Radiographs, Notes)
CREATE TABLE medical_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    type ENUM('RADIOGRAPH', 'NOTE', 'SCAN', 'PHOTO') NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_patient_id (patient_id),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
);

-- Clinical Notes Table - Treatment Notes
CREATE TABLE clinical_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    author_id INT NOT NULL,
    content TEXT NOT NULL,
    note_type ENUM('TREATMENT', 'OBSERVATION', 'PROGRESS', 'SUPERVISOR_REVIEW', 'DIAGNOSIS') DEFAULT 'TREATMENT',
    plan_procedure VARCHAR(255) NULL,
    planned_for DATETIME NULL,
    executed_at DATETIME NULL,
    execution_status ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED') NULL,
    outcome_notes TEXT NULL,
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by INT NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_patient_id (patient_id),
    INDEX idx_author_id (author_id),
    INDEX idx_verified (is_verified),
    INDEX idx_created_at (created_at),
    INDEX idx_deleted_at (deleted_at)
);

-- Queue Table - Live Clinic Queue Management
CREATE TABLE queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    provider_id INT NULL,
    student_id INT NULL,
    status ENUM('WAITING', 'IN_TREATMENT', 'PREPARATION', 'COMPLETED') DEFAULT 'WAITING',
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') DEFAULT 'NORMAL',
    procedure_type VARCHAR(255),
    arrival_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    start_time TIMESTAMP NULL,
    completion_time TIMESTAMP NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_arrival_time (arrival_time),
    INDEX idx_patient_id (patient_id)
);

-- Cases Table - Student Case Tracker
CREATE TABLE cases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    student_id INT NOT NULL,
    supervisor_id INT NOT NULL,
    status ENUM('ASSIGNED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED') DEFAULT 'ASSIGNED',
    progress_notes TEXT,
    requirements_met JSON,
    supervisor_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_student_id (student_id),
    INDEX idx_supervisor_id (supervisor_id),
    INDEX idx_status (status),
    INDEX idx_patient_id (patient_id)
);

-- Inventory Items Table - Materials Management
CREATE TABLE inventory_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL,
    minimum_threshold INT NOT NULL DEFAULT 0,
    maximum_threshold INT DEFAULT NULL,
    location VARCHAR(100),
    supplier VARCHAR(255),
    cost_per_unit DECIMAL(10,2),
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    deleted_by INT NULL DEFAULT NULL,
    purged_at TIMESTAMP NULL DEFAULT NULL,
    purged_by INT NULL DEFAULT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_quantity (quantity),
    INDEX idx_threshold (minimum_threshold),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_purged_at (purged_at)
);

-- Inventory Transactions Table - Stock Movement Tracking
CREATE TABLE inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    transaction_type ENUM('IN', 'OUT', 'ADJUSTMENT') NOT NULL,
    quantity INT NOT NULL,
    reference_type ENUM('PURCHASE', 'USAGE', 'ADJUSTMENT', 'EXPIRED') NOT NULL,
    reference_id INT NULL,
    performed_by INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_item_id (item_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_created_at (created_at)
);

-- Audit Logs Table - System Activity Tracking
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp)
);

-- Refresh Tokens Table - JWT Token Management
CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at)
);

-- System Settings Table - Configuration
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_setting_key (setting_key)
);

-- Insert Default System Settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('clinic_name', 'University Dental Hospital Orthodontics Clinic', 'Name of the clinic'),
('max_file_size', '10485760', 'Maximum file upload size in bytes (10MB)'),
('allowed_file_types', 'jpg,jpeg,png,pdf,doc,docx', 'Allowed file extensions for uploads'),
('session_timeout', '3600', 'Session timeout in seconds'),
('auto_logout', 'true', 'Enable automatic logout');

-- Create Views for Common Queries

-- Patient Summary View
CREATE VIEW patient_summary AS
SELECT 
    p.id,
    p.patient_code,
    CONCAT(p.first_name, ' ', p.last_name) AS full_name,
    p.date_of_birth,
    TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age,
    p.gender,
    p.status,
    COUNT(DISTINCT v.id) AS total_visits,
    MAX(v.visit_date) AS last_visit_date,
    COUNT(DISTINCT c.id) AS active_cases
FROM patients p
LEFT JOIN visits v ON p.id = v.patient_id AND v.status = 'COMPLETED'
LEFT JOIN cases c ON p.id = c.patient_id AND c.status IN ('ASSIGNED', 'PENDING_VERIFICATION')
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- Queue Summary View
CREATE VIEW queue_summary AS
SELECT 
    q.id,
    q.patient_id,
    CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
    p.patient_code,
    q.status,
    q.priority,
    q.procedure_type,
    q.arrival_time,
    TIMESTAMPDIFF(MINUTE, q.arrival_time, NOW()) AS wait_time_minutes,
    CONCAT(u.name, ' (', u.role, ')') AS assigned_provider,
    CONCAT(s.name, ' (Student)') AS assigned_student
FROM queue q
JOIN patients p ON q.patient_id = p.id
LEFT JOIN users u ON q.provider_id = u.id
LEFT JOIN users s ON q.student_id = s.id
WHERE q.status != 'COMPLETED'
ORDER BY q.priority DESC, q.arrival_time ASC;

-- Student Progress View
CREATE VIEW student_progress AS
SELECT 
    u.id AS student_id,
    u.name AS student_name,
    COUNT(DISTINCT c.id) AS total_cases,
    COUNT(DISTINCT CASE WHEN c.status = 'VERIFIED' THEN c.id END) AS verified_cases,
    COUNT(DISTINCT CASE WHEN c.status = 'PENDING_VERIFICATION' THEN c.id END) AS pending_cases,
    ROUND(
        (COUNT(DISTINCT CASE WHEN c.status = 'VERIFIED' THEN c.id END) / 
        NULLIF(COUNT(DISTINCT c.id), 0)) * 100, 2
    ) AS completion_percentage,
    MAX(c.updated_at) AS last_activity
FROM users u
LEFT JOIN cases c ON u.id = c.student_id
WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
GROUP BY u.id, u.name;

-- Inventory Alerts View
CREATE VIEW inventory_alerts AS
SELECT 
    i.id,
    i.name,
    i.category,
    i.quantity,
    i.minimum_threshold,
    i.unit,
    CASE 
        WHEN i.quantity = 0 THEN 'OUT_OF_STOCK'
        WHEN i.quantity <= i.minimum_threshold THEN 'LOW_STOCK'
        ELSE 'NORMAL'
    END AS alert_level,
    i.last_updated
FROM inventory_items i
WHERE i.quantity <= i.minimum_threshold
ORDER BY i.quantity ASC;

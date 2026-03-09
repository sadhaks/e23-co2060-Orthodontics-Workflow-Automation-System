const bcrypt = require('bcryptjs');
const { query } = require('../src/config/database');
require('dotenv').config();

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await query('DELETE FROM audit_logs');
    await query('DELETE FROM refresh_tokens');
    await query('DELETE FROM inventory_transactions');
    await query('DELETE FROM clinical_notes');
    await query('DELETE FROM medical_documents');
    await query('DELETE FROM queue');
    await query('DELETE FROM visits');
    await query('DELETE FROM cases');
    await query('DELETE FROM inventory_items');
    await query('DELETE FROM patients');
    await query('DELETE FROM users');
    
    // Insert users
    console.log('👥 Creating users...');
    const users = [
      {
        name: 'System Administrator',
        email: 'admin@orthoflow.edu',
        password_hash: bcrypt.hashSync('admin123', 12),
        role: 'ADMIN',
        department: 'IT',
        status: 'ACTIVE'
      },
      {
        name: 'Dr. Sarah Johnson',
        email: 'sarah.johnson@orthoflow.edu',
        password_hash: bcrypt.hashSync('doctor123', 12),
        role: 'ORTHODONTIST',
        department: 'Orthodontics',
        status: 'ACTIVE'
      },
      {
        name: 'Dr. Michael Chen',
        email: 'michael.chen@orthoflow.edu',
        password_hash: bcrypt.hashSync('doctor123', 12),
        role: 'DENTAL_SURGEON',
        department: 'Oral Surgery',
        status: 'ACTIVE'
      },
      {
        name: 'Nurse Emily Wilson',
        email: 'emily.wilson@orthoflow.edu',
        password_hash: bcrypt.hashSync('nurse123', 12),
        role: 'NURSE',
        department: 'Nursing',
        status: 'ACTIVE'
      },
      {
        name: 'Alex Thompson',
        email: 'alex.thompson@orthoflow.edu',
        password_hash: bcrypt.hashSync('student123', 12),
        role: 'STUDENT',
        department: 'Orthodontics',
        status: 'ACTIVE'
      },
      {
        name: 'Maria Garcia',
        email: 'maria.garcia@orthoflow.edu',
        password_hash: bcrypt.hashSync('student123', 12),
        role: 'STUDENT',
        department: 'Orthodontics',
        status: 'ACTIVE'
      },
      {
        name: 'Receptionist Lisa Brown',
        email: 'lisa.brown@orthoflow.edu',
        password_hash: bcrypt.hashSync('reception123', 12),
        role: 'RECEPTION',
        department: 'Front Desk',
        status: 'ACTIVE'
      }
    ];
    
    for (const user of users) {
      await query('INSERT INTO users SET ?', user);
    }
    
    console.log('✅ Database seeding completed successfully!');
    console.log('\n👤 Login Credentials:');
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ Email                 │ Role      │ Password │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ admin@orthoflow.edu   │ Admin    │ admin123 │');
    console.log('│ sarah.johnson@...   │ Ortho    │ doctor123│');
    console.log('│ michael.chen@...    │ Surgeon  │ doctor123│');
    console.log('│ emily.wilson@...    │ Nurse    │ nurse123 │');
    console.log('│ alex.thompson@...   │ Student  │ student123│');
    console.log('│ maria.garcia@...    │ Student  │ student123│');
    console.log('│ lisa.brown@...     │ Reception│ reception123│');
    console.log('└─────────────────────────────────────────────────┘');
    console.log('\n🎯 Ready to start the application!');
      
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };

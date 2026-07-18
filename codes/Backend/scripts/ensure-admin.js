const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/database');
const { generateTemporaryPassword } = require('../src/utils/password');
const { sendInitialPasswordEmail } = require('../src/services/emailService');
require('dotenv').config();

const shouldResetAdminPassword = process.argv.includes('--reset-password');

const sendAdminTemporaryPasswordEmail = async ({ email, name, password, isReset }) => {
  try {
    const result = await sendInitialPasswordEmail({
      to: email,
      name,
      temporaryPassword: password,
      isReset
    });

    if (result.sent) {
      console.log(`✅ Temporary password email sent to ${email}`);
    } else if (result.simulated) {
      console.log(`⚠️ Temporary password email simulated for ${email}`);
    }
  } catch (error) {
    console.error(`⚠️ Temporary password email failed for ${email}: ${error.message}`);
  }
};

async function ensureAdmin() {
  try {
    const adminRows = await query("SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    const adminCount = Number(adminRows[0]?.total || 0);

    if (adminCount > 0 && !shouldResetAdminPassword) {
      console.log('✅ Admin account already exists');
      return;
    }

    const createdAt = new Date();
    const adminPassword = (process.env.SEED_ADMIN_PASSWORD || '').trim() || generateTemporaryPassword();
    const usesProvidedPassword = Boolean((process.env.SEED_ADMIN_PASSWORD || '').trim());
    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@orthoflow.edu').trim();
    const adminName = (process.env.SEED_ADMIN_NAME || 'System Administrator').trim();
    const adminDepartment = (process.env.SEED_ADMIN_DEPARTMENT || 'Orthodontics').trim();

    const existingRows = await query('SELECT id, name, email, role, status FROM users WHERE email = ? LIMIT 1', [adminEmail]);

    if (existingRows.length > 0) {
      await query(
        `UPDATE users
         SET name = ?,
             password_hash = ?,
             role = 'ADMIN',
             department = ?,
             status = 'ACTIVE',
             must_change_password = ?,
             password_changed_at = ?
         WHERE id = ?`,
        [
          adminName,
          bcrypt.hashSync(adminPassword, 12),
          adminDepartment || null,
          !usesProvidedPassword,
          usesProvidedPassword ? createdAt : null,
          existingRows[0].id
        ]
      );
      console.log(
        shouldResetAdminPassword
          ? `✅ Admin password reset: ${adminEmail}`
          : `✅ Existing user promoted/reset as admin: ${adminEmail}`
      );
    } else {
      await query('INSERT INTO users SET ?', {
        name: adminName,
        email: adminEmail,
        password_hash: bcrypt.hashSync(adminPassword, 12),
        role: 'ADMIN',
        department: adminDepartment || null,
        status: 'ACTIVE',
        must_change_password: !usesProvidedPassword,
        password_changed_at: usesProvidedPassword ? createdAt : null,
        last_login: null,
        last_activity_at: null
      });
      console.log(`✅ Created admin account: ${adminEmail}`);
    }

    console.log('👤 Admin Login Credentials');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    if (!usesProvidedPassword) {
      console.log('This is a generated temporary password. Change it after first login.');
      await sendAdminTemporaryPasswordEmail({
        email: adminEmail,
        name: adminName,
        password: adminPassword,
        isReset: shouldResetAdminPassword
      });
    } else {
      console.log('Password email not sent because SEED_ADMIN_PASSWORD is configured in .env.');
    }
  } catch (error) {
    console.error('❌ Admin account setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  ensureAdmin();
}

module.exports = { ensureAdmin };

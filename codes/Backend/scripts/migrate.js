const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const { buildMysqlSslConfig } = require('../src/config/mysqlSsl');
require('dotenv').config();

const databaseName = process.env.DB_NAME || 'orthoflow';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
  ssl: buildMysqlSslConfig()
};

async function runMigration() {
  let connection;
  let runtimePool;

  try {
    console.log('🔄 Starting database migration...');

    // Create connection without database specified
    connection = await mysql.createConnection(dbConfig);

    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../database-schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    console.log(`📝 Executing database schema from ${path.basename(schemaPath)}...`);
    await connection.query(schema);

    // Reconnect with the target database so the runtime schema guards can complete
    await connection.end();
    connection = await mysql.createConnection({
      ...dbConfig,
      database: databaseName
    });

    const { ensureAccessControlSchema, pool } = require('../src/config/database');
    runtimePool = pool;
    await ensureAccessControlSchema();

    console.log('✅ Database migration completed successfully!');
    console.log(`\n📊 Database "${databaseName}" has been created with the current runtime schema:`);

    // List created tables
    const [tables] = await connection.execute(`SHOW TABLES FROM \`${databaseName}\``);
    console.log(tables.map(table => Object.values(table)[0]).join(', '));

    console.log('\n🎯 Migration completed. Ready to start the application!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    if (runtimePool) {
      await runtimePool.end();
    }
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };

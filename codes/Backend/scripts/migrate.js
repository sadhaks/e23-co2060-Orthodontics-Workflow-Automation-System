const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Starting database migration...');
    
    // Create connection without database specified
    connection = await mysql.createConnection(dbConfig);
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../database-schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    // Split by semicolon to handle multiple statements
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log('📝 Executing database schema...');
    
    // Execute each statement separately
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          // Use query instead of execute for statements that don't support prepared protocol
          await connection.query(statement);
        } catch (error) {
          // Ignore "database exists" errors but log others
          if (!error.message.includes('already exists')) {
            console.error('SQL Error:', error.message);
            console.error('Statement:', statement.substring(0, 100) + '...');
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Database migration completed successfully!');
    console.log('\n📊 Database "orthoflow" has been created with the following tables:');
    
    // List created tables
    const [tables] = await connection.execute('SHOW TABLES FROM orthoflow');
    console.log(tables.map(table => Object.values(table)[0]).join(', '));
    
    console.log('\n🎯 Migration completed. Ready to start the application!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };

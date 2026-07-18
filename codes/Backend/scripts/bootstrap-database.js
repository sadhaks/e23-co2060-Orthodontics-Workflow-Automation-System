const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const { buildMysqlSslConfig } = require('../src/config/mysqlSsl');
require('dotenv').config();

const databaseName = process.env.DB_NAME || 'orthoflow';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
  ssl: buildMysqlSslConfig()
};

const quoteIdentifier = (value) => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid DB_NAME "${value}". Use letters, numbers, and underscores only.`);
  }
  return `\`${value}\``;
};

const buildSchemaForDatabase = async () => {
  const schemaPath = path.join(__dirname, '../database-schema.sql');
  const quotedName = quoteIdentifier(databaseName);
  const schema = await fs.readFile(schemaPath, 'utf8');

  return schema
    .replace(/DROP DATABASE IF EXISTS\s+`?orthoflow`?\s*;/i, `DROP DATABASE IF EXISTS ${quotedName};`)
    .replace(
      /CREATE DATABASE IF NOT EXISTS\s+`?orthoflow`?\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci\s*;/i,
      `CREATE DATABASE IF NOT EXISTS ${quotedName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    )
    .replace(/USE\s+`?orthoflow`?\s*;/i, `USE ${quotedName};`);
};

async function databaseExists(connection) {
  const [rows] = await connection.execute(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1',
    [databaseName]
  );
  return rows.length > 0;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [databaseName, tableName]
  );
  return rows.length > 0;
}

async function tableCount(connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?`,
    [databaseName]
  );
  return Number(rows[0]?.total || 0);
}

async function applySchema(connection) {
  const schema = await buildSchemaForDatabase();
  console.log(`📦 Initializing database "${databaseName}" from database-schema.sql...`);
  await connection.query(schema);
  console.log('✅ Database schema initialized');
}

async function runRuntimeSchemaGuards() {
  const { ensureAccessControlSchema, pool } = require('../src/config/database');
  try {
    await ensureAccessControlSchema();
  } finally {
    await pool.end();
  }
}

async function bootstrapDatabase() {
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);

    if (!(await databaseExists(connection))) {
      console.log(`⚠️ Database "${databaseName}" not found`);
      await applySchema(connection);
      await runRuntimeSchemaGuards();
      return;
    }

    const runtimeConnection = await mysql.createConnection({
      ...dbConfig,
      database: databaseName
    });

    try {
      if (await tableExists(runtimeConnection, 'users')) {
        console.log('✅ Database schema already initialized');
        await runRuntimeSchemaGuards();
        return;
      }

      const existingTableCount = await tableCount(runtimeConnection);
      if (existingTableCount > 0) {
        throw new Error(
          `Database "${databaseName}" exists but does not contain the OrthoFlow users table. ` +
          'Refusing to auto-initialize a non-empty unknown database.'
        );
      }
    } finally {
      await runtimeConnection.end();
    }

    await applySchema(connection);
    await runRuntimeSchemaGuards();
  } catch (error) {
    console.error('❌ Database bootstrap failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  bootstrapDatabase();
}

module.exports = { bootstrapDatabase };

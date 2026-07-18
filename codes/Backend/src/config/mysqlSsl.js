const getBooleanEnv = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const buildMysqlSslConfig = () => {
  if (!getBooleanEnv('DB_SSL')) {
    return undefined;
  }

  const sslConfig = {
    rejectUnauthorized: getBooleanEnv('DB_SSL_REJECT_UNAUTHORIZED', true)
  };

  if (process.env.DB_SSL_CA) {
    sslConfig.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }

  return sslConfig;
};

module.exports = {
  buildMysqlSslConfig
};

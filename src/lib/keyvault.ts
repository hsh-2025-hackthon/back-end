// Environment-based secret management
// Replaced Azure Key Vault with direct environment variable access

// Utility function to get connection strings from environment variables
export const getConnectionString = (serviceName: string): string => {
  const envVarName = `${serviceName.toUpperCase()}_CONNECTION_STRING`;
  const connectionString = process.env[envVarName];
  
  if (!connectionString) {
    throw new Error(`Connection string for ${serviceName} not found in environment variables (${envVarName})`);
  }
  
  return connectionString;
};

// Specific getters for common secrets
export const getDatabaseConnectionString = (): string => {
  return getConnectionString('postgres');
};

export const getCosmosConnectionString = (): string => {
  return getConnectionString('cosmos');
};

export const getServiceBusConnectionString = (): string => {
  return getConnectionString('servicebus');
};

export const getEventHubConnectionString = (): string => {
  return getConnectionString('eventhub');
};

export const getWebPubSubConnectionString = (): string => {
  return getConnectionString('webpubsub');
};

export const getOpenAIApiKey = (): string => {
  const apiKey = process.env.AZURE_OPENAI_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not found in environment variables (AZURE_OPENAI_KEY)');
  }
  
  return apiKey;
};

export const testKeyVaultConnection = async (): Promise<boolean> => {
  console.log('Key Vault removed - using environment variables for secrets');
  return true;
};
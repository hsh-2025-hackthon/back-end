import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

interface KeyVaultConfig {
  vaultUrl: string;
}

const getKeyVaultConfig = (): KeyVaultConfig => {
  return {
    vaultUrl: process.env.AZURE_KEYVAULT_URL || 'https://placeholder-keyvault.vault.azure.net/'
  };
};

let secretClient: SecretClient;

export const getKeyVaultClient = (): SecretClient => {
  if (!secretClient) {
    const config = getKeyVaultConfig();
    const credential = new DefaultAzureCredential();
    
    secretClient = new SecretClient(config.vaultUrl, credential);
  }
  
  return secretClient;
};

export const getSecret = async (secretName: string): Promise<string | undefined> => {
  try {
    const client = getKeyVaultClient();
    const secret = await client.getSecret(secretName);
    return secret.value;
  } catch (error) {
    console.error(`Failed to get secret ${secretName} from Key Vault:`, error);
    return undefined;
  }
};

export const setSecret = async (secretName: string, secretValue: string): Promise<void> => {
  try {
    const client = getKeyVaultClient();
    await client.setSecret(secretName, secretValue);
    console.log(`Secret ${secretName} set successfully`);
  } catch (error) {
    console.error(`Failed to set secret ${secretName} in Key Vault:`, error);
    throw error;
  }
};

// Utility function to get connection strings from Key Vault
export const getConnectionString = async (serviceName: string): Promise<string> => {
  const secretName = `${serviceName}-connection-string`;
  const connectionString = await getSecret(secretName);
  
  if (!connectionString) {
    // Fallback to environment variable
    const envVarName = `${serviceName.toUpperCase()}_CONNECTION_STRING`;
    const fallback = process.env[envVarName];
    
    if (!fallback) {
      throw new Error(`Connection string for ${serviceName} not found in Key Vault or environment variables`);
    }
    
    console.warn(`Using fallback environment variable for ${serviceName} connection string`);
    return fallback;
  }
  
  return connectionString;
};

// Specific getters for common secrets
export const getDatabaseConnectionString = async (): Promise<string> => {
  return getConnectionString('postgres');
};

export const getCosmosConnectionString = async (): Promise<string> => {
  return getConnectionString('cosmos');
};

export const getServiceBusConnectionString = async (): Promise<string> => {
  return getConnectionString('servicebus');
};

export const getEventHubConnectionString = async (): Promise<string> => {
  return getConnectionString('eventhub');
};

export const getWebPubSubConnectionString = async (): Promise<string> => {
  return getConnectionString('webpubsub');
};

export const getOpenAIApiKey = async (): Promise<string> => {
  const apiKey = await getSecret('openai-api-key');
  
  if (!apiKey) {
    const fallback = process.env.AZURE_OPENAI_KEY;
    if (!fallback) {
      throw new Error('OpenAI API key not found in Key Vault or environment variables');
    }
    return fallback;
  }
  
  return apiKey;
};

export const testKeyVaultConnection = async (): Promise<boolean> => {
  try {
    const client = getKeyVaultClient();
    
    // Try to list secrets (just to test connection)
    const secretIterator = client.listPropertiesOfSecrets();
    await secretIterator.next();
    
    console.log('Key Vault connection successful');
    return true;
  } catch (error) {
    console.error('Key Vault connection failed:', error);
    return false;
  }
};
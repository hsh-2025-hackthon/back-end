import { CosmosClient, Container, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

interface CosmosConfig {
  endpoint: string;
  key?: string;
  databaseId: string;
  containerId: string;
}

const getCosmosConfig = (): CosmosConfig => {
  return {
    endpoint: process.env.COSMOS_DB_ENDPOINT || 'https://placeholder.documents.azure.com:443/',
    key: process.env.COSMOS_DB_KEY,
    databaseId: process.env.COSMOS_DB_DATABASE_ID || 'travel-planning',
    containerId: process.env.COSMOS_DB_CONTAINER_ID || 'trip-itineraries'
  };
};

let cosmosClient: CosmosClient;
let database: Database;
let container: Container;

export const getCosmosClient = (): CosmosClient => {
  if (!cosmosClient) {
    const config = getCosmosConfig();
    
    if (config.key) {
      cosmosClient = new CosmosClient({
        endpoint: config.endpoint,
        key: config.key
      });
    } else {
      // Use Managed Identity in production
      cosmosClient = new CosmosClient({
        endpoint: config.endpoint,
        aadCredentials: new DefaultAzureCredential()
      });
    }
  }
  
  return cosmosClient;
};

export const getCosmosDatabase = async (): Promise<Database> => {
  if (!database) {
    const client = getCosmosClient();
    const config = getCosmosConfig();
    
    const { database: db } = await client.databases.createIfNotExists({
      id: config.databaseId
    });
    
    database = db;
  }
  
  return database;
};

export const getCosmosContainer = async (): Promise<Container> => {
  if (!container) {
    const db = await getCosmosDatabase();
    const config = getCosmosConfig();
    
    const { container: cont } = await db.containers.createIfNotExists({
      id: config.containerId,
      partitionKey: { paths: ['/tripId'] }
    });
    
    container = cont;
  }
  
  return container;
};

// Trip read models for Cosmos DB
export interface TripReadModel {
  id: string;
  tripId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  destination?: {
    name: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  budget?: number;
  currency: string;
  status: string;
  createdBy: string;
  collaborators: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
  }>;
  itinerary?: Array<{
    day: number;
    date: string;
    activities: Array<{
      id: string;
      name: string;
      description?: string;
      location?: string;
      time?: string;
      duration?: number;
      cost?: number;
    }>;
  }>;
  lastUpdated: string;
}

export class TripReadModelRepository {
  static async upsert(tripReadModel: TripReadModel): Promise<void> {
    const container = await getCosmosContainer();
    
    await container.items.upsert(tripReadModel);
  }

  static async findByTripId(tripId: string): Promise<TripReadModel | null> {
    const container = await getCosmosContainer();
    
    try {
      const { resource } = await container.item(tripId, tripId).read<TripReadModel>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  static async findByUserId(userId: string): Promise<TripReadModel[]> {
    const container = await getCosmosContainer();
    
    const querySpec = {
      query: `SELECT * FROM c WHERE c.createdBy = @userId OR ARRAY_CONTAINS(c.collaborators, {"userId": @userId}, true)`,
      parameters: [
        {
          name: '@userId',
          value: userId
        }
      ]
    };
    
    const { resources } = await container.items.query<TripReadModel>(querySpec).fetchAll();
    return resources;
  }

  static async delete(tripId: string): Promise<void> {
    const container = await getCosmosContainer();
    
    try {
      await container.item(tripId, tripId).delete();
    } catch (error: any) {
      if (error.code !== 404) {
        throw error;
      }
    }
  }

  static async search(query: string, userId?: string): Promise<TripReadModel[]> {
    const container = await getCosmosContainer();
    
    let sqlQuery = `
      SELECT * FROM c 
      WHERE CONTAINS(LOWER(c.title), LOWER(@query)) 
         OR CONTAINS(LOWER(c.description), LOWER(@query))
         OR CONTAINS(LOWER(c.destination.name), LOWER(@query))
    `;
    
    const parameters = [{ name: '@query', value: query }];
    
    if (userId) {
      sqlQuery += ` AND (c.createdBy = @userId OR ARRAY_CONTAINS(c.collaborators, {"userId": @userId}, true))`;
      parameters.push({ name: '@userId', value: userId });
    }
    
    const querySpec = { query: sqlQuery, parameters };
    const { resources } = await container.items.query<TripReadModel>(querySpec).fetchAll();
    
    return resources;
  }
}


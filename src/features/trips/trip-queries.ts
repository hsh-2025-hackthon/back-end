import { Trip } from '../../models/trip';
import { getCosmosClient } from '../../lib/cosmos';

// Query handlers for read models in Cosmos DB
export class TripQueries {
  private static async getContainer() {
    const client = getCosmosClient();
    const database = client.database('travel-planning');
    return database.container('trips');
  }

  static async getTripById(tripId: string): Promise<Trip | null> {
    try {
      const container = await this.getContainer();
      const querySpec = {
        query: "SELECT * FROM c WHERE c.id = @tripId",
        parameters: [
          { name: "@tripId", value: tripId }
        ]
      };
      
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources.length > 0 ? resources[0] : null;
    } catch (error) {
      console.error('Error querying trip by ID:', error);
      return null;
    }
  }

  static async getTripsByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<Trip[]> {
    try {
      const container = await this.getContainer();
      const querySpec = {
        query: `
          SELECT * FROM c 
          WHERE c.createdBy = @userId 
             OR ARRAY_CONTAINS(c.collaborators, {"userId": @userId}, true)
          ORDER BY c.createdAt DESC
          OFFSET @offset LIMIT @limit
        `,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@offset", value: offset },
          { name: "@limit", value: limit }
        ]
      };
      
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources;
    } catch (error) {
      console.error('Error querying trips by user ID:', error);
      return [];
    }
  }

  static async searchTrips(searchTerm: string, userId: string, limit: number = 20): Promise<Trip[]> {
    try {
      const container = await this.getContainer();
      const querySpec = {
        query: `
          SELECT * FROM c 
          WHERE (c.createdBy = @userId OR ARRAY_CONTAINS(c.collaborators, {"userId": @userId}, true))
            AND (CONTAINS(LOWER(c.title), LOWER(@searchTerm)) 
                 OR CONTAINS(LOWER(c.description), LOWER(@searchTerm))
                 OR EXISTS(SELECT VALUE d FROM d IN c.destinations WHERE CONTAINS(LOWER(d.name), LOWER(@searchTerm))))
          ORDER BY c.createdAt DESC
          OFFSET 0 LIMIT @limit
        `,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@searchTerm", value: searchTerm },
          { name: "@limit", value: limit }
        ]
      };
      
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources;
    } catch (error) {
      console.error('Error searching trips:', error);
      return [];
    }
  }

  static async getTripsByDestination(destination: string, limit: number = 20): Promise<Trip[]> {
    try {
      const container = await this.getContainer();
      const querySpec = {
        query: `
          SELECT * FROM c 
          WHERE EXISTS(SELECT VALUE d FROM d IN c.destinations 
                       WHERE CONTAINS(LOWER(d.name), LOWER(@destination)) 
                          OR CONTAINS(LOWER(d.country), LOWER(@destination))
                          OR CONTAINS(LOWER(d.city), LOWER(@destination)))
          ORDER BY c.createdAt DESC
          OFFSET 0 LIMIT @limit
        `,
        parameters: [
          { name: "@destination", value: destination },
          { name: "@limit", value: limit }
        ]
      };
      
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources;
    } catch (error) {
      console.error('Error querying trips by destination:', error);
      return [];
    }
  }

  static async getTripStats(userId: string): Promise<{ 
    totalTrips: number, 
    activeTrips: number, 
    completedTrips: number,
    destinationCount: number 
  }> {
    try {
      const container = await this.getContainer();
      const querySpec = {
        query: `
          SELECT 
            COUNT(1) as totalTrips,
            SUM(c.status = 'in-progress' ? 1 : 0) as activeTrips,
            SUM(c.status = 'completed' ? 1 : 0) as completedTrips,
            SUM(ARRAY_LENGTH(c.destinations)) as destinationCount
          FROM c 
          WHERE c.createdBy = @userId 
             OR ARRAY_CONTAINS(c.collaborators, {"userId": @userId}, true)
        `,
        parameters: [
          { name: "@userId", value: userId }
        ]
      };
      
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources[0] || { totalTrips: 0, activeTrips: 0, completedTrips: 0, destinationCount: 0 };
    } catch (error) {
      console.error('Error querying trip stats:', error);
      return { totalTrips: 0, activeTrips: 0, completedTrips: 0, destinationCount: 0 };
    }
  }
}

// Event handlers for updating read models
export class TripEventHandlers {
  private static async getContainer() {
    const client = getCosmosClient();
    const database = client.database('travel-planning');
    return database.container('trips');
  }

  static async handleTripCreated(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      const tripReadModel = {
        id: event.tripId,
        ...event.tripData,
        destinations: [],
        collaborators: [],
        _ts: Math.floor(Date.now() / 1000)
      };
      
      await container.items.create(tripReadModel);
      console.log(`Trip read model created: ${event.tripId}`);
    } catch (error) {
      console.error('Error creating trip read model:', error);
    }
  }

  static async handleTripUpdated(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      const { resource: existingTrip } = await container.item(event.tripId, event.tripId).read();
      
      if (existingTrip) {
        const updatedTrip = {
          ...existingTrip,
          ...event.tripData,
          _ts: Math.floor(Date.now() / 1000)
        };
        
        await container.item(event.tripId, event.tripId).replace(updatedTrip);
        console.log(`Trip read model updated: ${event.tripId}`);
      }
    } catch (error) {
      console.error('Error updating trip read model:', error);
    }
  }

  static async handleTripDeleted(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      await container.item(event.tripId, event.tripId).delete();
      console.log(`Trip read model deleted: ${event.tripId}`);
    } catch (error) {
      console.error('Error deleting trip read model:', error);
    }
  }

  static async handleDestinationAdded(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      const { resource: existingTrip } = await container.item(event.tripId, event.tripId).read();
      
      if (existingTrip) {
        const destinations = existingTrip.destinations || [];
        destinations.push(event.destinationData);
        
        const updatedTrip = {
          ...existingTrip,
          destinations,
          _ts: Math.floor(Date.now() / 1000)
        };
        
        await container.item(event.tripId, event.tripId).replace(updatedTrip);
        console.log(`Destination added to trip read model: ${event.tripId}`);
      }
    } catch (error) {
      console.error('Error adding destination to trip read model:', error);
    }
  }

  static async handleDestinationUpdated(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      const { resource: existingTrip } = await container.item(event.tripId, event.tripId).read();
      
      if (existingTrip) {
        const destinations = existingTrip.destinations || [];
        const destinationIndex = destinations.findIndex((d: any) => d.id === event.destinationId);
        
        if (destinationIndex > -1) {
          destinations[destinationIndex] = event.destinationData;
          
          const updatedTrip = {
            ...existingTrip,
            destinations,
            _ts: Math.floor(Date.now() / 1000)
          };
          
          await container.item(event.tripId, event.tripId).replace(updatedTrip);
          console.log(`Destination updated in trip read model: ${event.tripId}`);
        }
      }
    } catch (error) {
      console.error('Error updating destination in trip read model:', error);
    }
  }

  static async handleDestinationRemoved(event: any): Promise<void> {
    try {
      const container = await this.getContainer();
      const { resource: existingTrip } = await container.item(event.tripId, event.tripId).read();
      
      if (existingTrip) {
        const destinations = existingTrip.destinations || [];
        const filteredDestinations = destinations.filter((d: any) => d.id !== event.destinationId);
        
        const updatedTrip = {
          ...existingTrip,
          destinations: filteredDestinations,
          _ts: Math.floor(Date.now() / 1000)
        };
        
        await container.item(event.tripId, event.tripId).replace(updatedTrip);
        console.log(`Destination removed from trip read model: ${event.tripId}`);
      }
    } catch (error) {
      console.error('Error removing destination from trip read model:', error);
    }
  }
}

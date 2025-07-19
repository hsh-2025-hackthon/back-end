import { CosmosClient } from '@azure/cosmos';
import { processEvents } from '../../lib/servicebus';
import { TripRepository } from '../../models/trip';

// Interface for events from the command side
interface EventData {
  id: string;
  type: string;
  aggregateId: string;
  data: any;
  timestamp: Date;
  version: number;
}

export class TripEventProcessor {
  private isProcessing = false;
  private cosmosClient: CosmosClient | null = null;
  private database: any;
  private tripsContainer: any;

  constructor() {
    // Initialize Cosmos DB if connection string is available
    const connectionString = process.env.AZURE_COSMOS_CONNECTION_STRING;
    if (connectionString) {
      this.cosmosClient = new CosmosClient(connectionString);
      this.database = this.cosmosClient.database('travel-planning');
      this.tripsContainer = this.database.container('trips');
    } else {
      console.warn('AZURE_COSMOS_CONNECTION_STRING not configured - read model sync disabled');
    }
  }

  async start(): Promise<void> {
    try {
      this.isProcessing = true;
      console.log('Starting trip event processor...');
      
      // Start processing events using the new Bull Queue system
      await processEvents(this.handleEvent.bind(this));
      
      console.log('Trip event processor started');
    } catch (error) {
      console.error('Error starting trip event processor:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.isProcessing) {
      this.isProcessing = false;
      console.log('Trip event processor stopped');
    }
  }

  private async handleEvent(eventData: EventData): Promise<void> {
    try {
      console.log(`Processing event: ${eventData.type} for trip ${eventData.aggregateId}`);

      switch (eventData.type) {
        case 'trip-created':
          await this.handleTripCreated(eventData);
          break;
        case 'trip-updated':
          await this.handleTripUpdated(eventData);
          break;
        case 'trip-deleted':
          await this.handleTripDeleted(eventData);
          break;
        case 'destination-added':
          await this.handleDestinationAdded(eventData);
          break;
        case 'destination-updated':
          await this.handleDestinationUpdated(eventData);
          break;
        case 'destination-removed':
          await this.handleDestinationRemoved(eventData);
          break;
        case 'collaborator-added':
          await this.handleCollaboratorAdded(eventData);
          break;
        default:
          console.log(`Unknown event type: ${eventData.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      throw error; // This will dead letter the message
    }
  }

  private async handleError(args: any): Promise<void> {
    console.error('Error in event processor:', args.error);
  }

  private async handleTripCreated(event: EventData): Promise<void> {
    if (!this.cosmosClient) {
      console.log('Cosmos DB not configured - skipping read model update');
      return;
    }

    const { tripData } = event.data;
    
    // Get full trip data from PostgreSQL
    const fullTrip = await TripRepository.findByIdWithDestinations(tripData.id);
    if (!fullTrip) {
      console.error(`Trip ${tripData.id} not found in PostgreSQL`);
      return;
    }

    // Create read model document in Cosmos DB
    const readModel = {
      id: fullTrip.id,
      partitionKey: fullTrip.createdBy, // Partition by user for efficient queries
      title: fullTrip.title,
      description: fullTrip.description,
      startDate: fullTrip.startDate,
      endDate: fullTrip.endDate,
      destinations: fullTrip.destinations || [],
      budget: fullTrip.budget,
      currency: fullTrip.currency,
      status: fullTrip.status,
      createdBy: fullTrip.createdBy,
      createdAt: fullTrip.createdAt,
      updatedAt: fullTrip.updatedAt,
      collaborators: [],
      // Cosmos DB specific fields
      _ts: Math.floor(Date.now() / 1000),
      eventVersion: event.version
    };

    await this.tripsContainer.items.create(readModel);
    console.log(`Created read model for trip ${fullTrip.id}`);
  }

  private async handleTripUpdated(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripData } = event.data;
    
    // Get updated trip data from PostgreSQL
    const updatedTrip = await TripRepository.findByIdWithDestinations(tripData.id);
    if (!updatedTrip) {
      console.error(`Trip ${tripData.id} not found in PostgreSQL`);
      return;
    }

    // Update read model in Cosmos DB
    try {
      const { resource: existingDoc } = await this.tripsContainer.item(updatedTrip.id, updatedTrip.createdBy).read();
      
      if (existingDoc) {
        const updatedDoc = {
          ...existingDoc,
          title: updatedTrip.title,
          description: updatedTrip.description,
          startDate: updatedTrip.startDate,
          endDate: updatedTrip.endDate,
          budget: updatedTrip.budget,
          currency: updatedTrip.currency,
          status: updatedTrip.status,
          updatedAt: updatedTrip.updatedAt,
          _ts: Math.floor(Date.now() / 1000),
          eventVersion: event.version
        };

        await this.tripsContainer.item(updatedTrip.id, updatedTrip.createdBy).replace(updatedDoc);
        console.log(`Updated read model for trip ${updatedTrip.id}`);
      }
    } catch (error) {
      console.error(`Error updating read model for trip ${updatedTrip.id}:`, error);
    }
  }

  private async handleTripDeleted(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripId, userId } = event.data;

    try {
      await this.tripsContainer.item(tripId, userId).delete();
      console.log(`Deleted read model for trip ${tripId}`);
    } catch (error: any) {
      if (error.code === 404) {
        console.log(`Read model for trip ${tripId} already deleted`);
      } else {
        console.error(`Error deleting read model for trip ${tripId}:`, error);
      }
    }
  }

  private async handleDestinationAdded(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripId, userId } = event.data;
    await this.updateDestinationsInReadModel(tripId, userId, event.version);
  }

  private async handleDestinationUpdated(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripId, userId } = event.data;
    await this.updateDestinationsInReadModel(tripId, userId, event.version);
  }

  private async handleDestinationRemoved(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripId, userId } = event.data;
    await this.updateDestinationsInReadModel(tripId, userId, event.version);
  }

  private async handleCollaboratorAdded(event: EventData): Promise<void> {
    if (!this.cosmosClient) return;

    const { tripId, userId } = event.data;
    
    try {
      // Get collaborators from PostgreSQL
      const collaborators = await TripRepository.getCollaborators(tripId);

      // Update collaborators in read model
      const { resource: existingDoc } = await this.tripsContainer.item(tripId, userId).read();
      
      if (existingDoc) {
        const updatedDoc = {
          ...existingDoc,
          collaborators: collaborators,
          _ts: Math.floor(Date.now() / 1000),
          eventVersion: event.version
        };

        await this.tripsContainer.item(tripId, userId).replace(updatedDoc);
        console.log(`Added collaborator to read model for trip ${tripId}`);
      }
    } catch (error) {
      console.error(`Error updating collaborators for trip ${tripId}:`, error);
    }
  }

  private async updateDestinationsInReadModel(tripId: string, userId: string, version: number): Promise<void> {
    try {
      // Get updated trip with destinations from PostgreSQL
      const updatedTrip = await TripRepository.findByIdWithDestinations(tripId);
      if (!updatedTrip) {
        console.error(`Trip ${tripId} not found in PostgreSQL`);
        return;
      }

      // Update destinations in read model
      const { resource: existingDoc } = await this.tripsContainer.item(tripId, userId).read();
      
      if (existingDoc) {
        const updatedDoc = {
          ...existingDoc,
          destinations: updatedTrip.destinations || [],
          updatedAt: updatedTrip.updatedAt,
          _ts: Math.floor(Date.now() / 1000),
          eventVersion: version
        };

        await this.tripsContainer.item(tripId, userId).replace(updatedDoc);
        console.log(`Updated destinations in read model for trip ${tripId}`);
      }
    } catch (error) {
      console.error(`Error updating destinations for trip ${tripId}:`, error);
    }
  }
}

// Export a singleton instance
export const tripEventProcessor = new TripEventProcessor();

// Note: Event processor is started manually from server.ts to avoid duplicate handler registration
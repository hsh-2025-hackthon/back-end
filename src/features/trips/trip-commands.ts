import { Trip, TripRepository, CreateTripData, CreateDestinationData } from '../../models/trip';
import { UserRepository } from '../../models/user';
import { publishEvent, generateId } from '../../lib/servicebus';
import { CosmosClient } from '@azure/cosmos';

// Command handlers with proper business logic
export class TripCommands {
  static async createTrip(tripData: CreateTripData): Promise<Trip> {
    try {
      // Create trip in PostgreSQL (command store)
      const newTrip = await TripRepository.create(tripData);
      
      // Emit event for read model synchronization
      await publishEvent({
        id: generateId(),
        type: 'trip-created',
        aggregateId: newTrip.id,
        data: {
          tripId: newTrip.id,
          userId: newTrip.createdBy,
          tripData: newTrip
        },
        timestamp: new Date(),
        version: 1
      });
      
      return newTrip;
    } catch (error) {
      console.error('Error creating trip:', error);
      throw error;
    }
  }

  static async updateTrip(tripId: string, tripData: Partial<CreateTripData>, userId: string): Promise<Trip | null> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Update trip in PostgreSQL
      const updatedTrip = await TripRepository.update(tripId, tripData);
      
      if (updatedTrip) {
        // Emit event for read model synchronization
        await publishEvent({
          id: generateId(),
          type: 'trip-updated',
          aggregateId: updatedTrip.id,
          data: {
            tripId: updatedTrip.id,
            userId: updatedTrip.createdBy,
            tripData: updatedTrip
          },
          timestamp: new Date(),
          version: 1
        });
      }
      
      return updatedTrip;
    } catch (error) {
      console.error('Error updating trip:', error);
      throw error;
    }
  }

  static async deleteTrip(tripId: string, userId: string): Promise<void> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Delete trip from PostgreSQL
      await TripRepository.delete(tripId);
      
      // Emit event for read model synchronization
      await publishEvent({
        id: generateId(),
        type: 'trip-deleted',
        aggregateId: tripId,
        data: {
          tripId: tripId,
          userId: userId
        },
        timestamp: new Date(),
        version: 1
      });
    } catch (error) {
      console.error('Error deleting trip:', error);
      throw error;
    }
  }

  static async addDestinationToTrip(tripId: string, destinationData: CreateDestinationData, userId: string): Promise<Trip | null> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Add destination to PostgreSQL
      const destination = await TripRepository.addDestination(tripId, destinationData);
      
      // Get updated trip with destinations
      const updatedTrip = await TripRepository.findByIdWithDestinations(tripId);
      
      if (updatedTrip) {
        // Emit event for read model synchronization
        await publishEvent({
          id: generateId(),
          type: 'destination-added',
          aggregateId: tripId,
          data: {
            tripId: tripId,
            destinationId: destination.id,
            destinationData: destination,
            userId: userId
          },
          timestamp: new Date(),
          version: 1
        });
      }
      
      return updatedTrip;
    } catch (error) {
      console.error('Error adding destination to trip:', error);
      throw error;
    }
  }

  static async updateDestination(tripId: string, destinationId: string, destinationData: Partial<CreateDestinationData>, userId: string): Promise<Trip | null> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Update destination in PostgreSQL
      const updatedDestination = await TripRepository.updateDestination(tripId, destinationId, destinationData);
      
      if (updatedDestination) {
        // Get updated trip with destinations
        const updatedTrip = await TripRepository.findByIdWithDestinations(tripId);
        
        // Emit event for read model synchronization
        await publishEvent({
          id: generateId(),
          type: 'destination-updated',
          aggregateId: tripId,
          data: {
            tripId: tripId,
            destinationId: destinationId,
            destinationData: updatedDestination,
            userId: userId
          },
          timestamp: new Date(),
          version: 1
        });
        
        return updatedTrip;
      }
      
      return null;
    } catch (error) {
      console.error('Error updating destination:', error);
      throw error;
    }
  }

  static async removeDestination(tripId: string, destinationId: string, userId: string): Promise<void> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Remove destination from PostgreSQL
      const success = await TripRepository.removeDestination(tripId, destinationId);
      
      if (success) {
        // Emit event for read model synchronization
        await publishEvent({
          id: generateId(),
          type: 'destination-removed',
          aggregateId: tripId,
          data: {
            tripId: tripId,
            destinationId: destinationId,
            userId: userId
          },
          timestamp: new Date(),
          version: 1
        });
      }
    } catch (error) {
      console.error('Error removing destination:', error);
      throw error;
    }
  }

  static async addCollaborator(tripId: string, collaboratorEmail: string, role: 'editor' | 'viewer', userId: string): Promise<void> {
    try {
      // Verify ownership
      const existingTrip = await TripRepository.findById(tripId);
      if (!existingTrip || existingTrip.createdBy !== userId) {
        throw new Error('Trip not found or access denied');
      }

      // Look up user by email
      const collaborator = await UserRepository.findByEmail(collaboratorEmail);
      if (!collaborator) {
        throw new Error('User not found');
      }
      
      await TripRepository.addCollaborator(tripId, collaborator.id, role);
      
      await publishEvent({
        id: generateId(),
        type: 'collaborator-added',
        aggregateId: tripId,
        data: {
          tripId: tripId,
          collaboratorId: collaborator.id,
          role: role,
          userId: userId
        },
        timestamp: new Date(),
        version: 1
      });
    } catch (error) {
      console.error('Error adding collaborator:', error);
      throw error;
    }
  }
}

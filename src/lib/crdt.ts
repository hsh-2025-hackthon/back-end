import * as Y from 'yjs';
import { broadcastToTrip } from './webpubsub';

// Interface for document state
interface TripDocument {
  title: string;
  description: string;
  destinations: Array<{
    id: string;
    name: string;
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    description?: string;
    orderIndex?: number;
  }>;
  collaborators: Array<{
    userId: string;
    name: string;
    isOnline: boolean;
    cursor?: {
      destination?: string;
      field?: string;
    };
  }>;
}

// CRDT service for managing collaborative trip editing
export class CRDTService {
  private documents: Map<string, Y.Doc> = new Map();

  constructor() {
    // No WebPubSub client needed anymore - using Redis Pub/Sub
  }

  // Get or create a Y.js document for a trip
  public getDocument(tripId: string): Y.Doc {
    let doc = this.documents.get(tripId);
    
    if (!doc) {
      doc = new Y.Doc();
      this.documents.set(tripId, doc);
      
      // Initialize document structure
      this.initializeDocument(doc);
      
      // Set up change tracking for real-time sync
      doc.on('update', (update: Uint8Array) => {
        this.broadcastUpdate(tripId, update);
      });
    }
    
    return doc;
  }

  // Initialize the document with the required structure
  private initializeDocument(doc: Y.Doc): void {
    // Create shared types for different parts of the trip
    const yMap = doc.getMap('trip');
    
    // Basic trip information
    yMap.set('title', '');
    yMap.set('description', '');
    
    // Destinations as a Y.Array for collaborative list editing
    const destinations = new Y.Array<Y.Map<any>>();
    yMap.set('destinations', destinations);
    
    // Collaborators and presence
    const collaborators = new Y.Array<Y.Map<any>>();
    yMap.set('collaborators', collaborators);
    
    // Cursor positions for real-time awareness
    const awareness = new Y.Map();
    yMap.set('awareness', awareness);
  }

  // Load existing trip data into the CRDT document
  public loadTripData(tripId: string, tripData: any): void {
    const doc = this.getDocument(tripId);
    const yMap = doc.getMap('trip');
    
    // Load basic information
    yMap.set('title', tripData.title || '');
    yMap.set('description', tripData.description || '');
    
    // Load destinations
    const destinations = yMap.get('destinations') as Y.Array<Y.Map<any>>;
    destinations.delete(0, destinations.length); // Clear existing
    
    if (tripData.destinations) {
      tripData.destinations.forEach((dest: any) => {
        const destMap = new Y.Map();
        destMap.set('id', dest.id);
        destMap.set('name', dest.name);
        destMap.set('country', dest.country || '');
        destMap.set('city', dest.city || '');
        destMap.set('latitude', dest.latitude || null);
        destMap.set('longitude', dest.longitude || null);
        destMap.set('description', dest.description || '');
        destMap.set('orderIndex', dest.orderIndex || 0);
        destinations.push([destMap]);
      });
    }
  }

  // Get the current state of a trip document
  public getTripState(tripId: string): TripDocument {
    const doc = this.getDocument(tripId);
    const yMap = doc.getMap('trip');
    
    const destinations = yMap.get('destinations') as Y.Array<Y.Map<any>>;
    const collaborators = yMap.get('collaborators') as Y.Array<Y.Map<any>>;
    
    return {
      title: (yMap.get('title') as string) || '',
      description: (yMap.get('description') as string) || '',
      destinations: destinations.toArray().map(destMap => ({
        id: destMap.get('id'),
        name: destMap.get('name'),
        country: destMap.get('country'),
        city: destMap.get('city'),
        latitude: destMap.get('latitude'),
        longitude: destMap.get('longitude'),
        description: destMap.get('description'),
        orderIndex: destMap.get('orderIndex')
      })),
      collaborators: collaborators.toArray().map(collabMap => ({
        userId: collabMap.get('userId'),
        name: collabMap.get('name'),
        isOnline: collabMap.get('isOnline') || false,
        cursor: collabMap.get('cursor')
      }))
    };
  }

  // Apply an update to a document (from remote client)
  public applyUpdate(tripId: string, update: Uint8Array): void {
    const doc = this.getDocument(tripId);
    Y.applyUpdate(doc, update);
  }

  // Get the current document state as an update
  public getDocumentUpdate(tripId: string): Uint8Array {
    const doc = this.getDocument(tripId);
    return Y.encodeStateAsUpdate(doc);
  }

  // Add a user to the collaboration session
  public addCollaborator(tripId: string, userId: string, userName: string): void {
    const doc = this.getDocument(tripId);
    const yMap = doc.getMap('trip');
    const collaborators = yMap.get('collaborators') as Y.Array<Y.Map<any>>;
    
    // Check if user already exists
    const existingIndex = collaborators.toArray().findIndex(collab => 
      collab.get('userId') === userId
    );
    
    if (existingIndex >= 0) {
      // Update existing collaborator
      const collabMap = collaborators.get(existingIndex);
      collabMap.set('isOnline', true);
      collabMap.set('name', userName);
    } else {
      // Add new collaborator
      const collabMap = new Y.Map();
      collabMap.set('userId', userId);
      collabMap.set('name', userName);
      collabMap.set('isOnline', true);
      collabMap.set('cursor', null);
      collaborators.push([collabMap]);
    }
  }

  // Remove a user from the collaboration session
  public removeCollaborator(tripId: string, userId: string): void {
    const doc = this.getDocument(tripId);
    const yMap = doc.getMap('trip');
    const collaborators = yMap.get('collaborators') as Y.Array<Y.Map<any>>;
    
    const existingIndex = collaborators.toArray().findIndex(collab => 
      collab.get('userId') === userId
    );
    
    if (existingIndex >= 0) {
      const collabMap = collaborators.get(existingIndex);
      collabMap.set('isOnline', false);
    }
  }

  // Update user cursor position for awareness
  public updateCursor(tripId: string, userId: string, cursor: { destination?: string; field?: string }): void {
    const doc = this.getDocument(tripId);
    const yMap = doc.getMap('trip');
    const collaborators = yMap.get('collaborators') as Y.Array<Y.Map<any>>;
    
    const existingIndex = collaborators.toArray().findIndex(collab => 
      collab.get('userId') === userId
    );
    
    if (existingIndex >= 0) {
      const collabMap = collaborators.get(existingIndex);
      collabMap.set('cursor', cursor);
    }
  }

  // Broadcast document updates to all connected clients via Web PubSub
  private async broadcastUpdate(tripId: string, update: Uint8Array): Promise<void> {
    try {
      const message = {
        type: 'document-update',
        tripId,
        update: Array.from(update), // Convert Uint8Array to regular array for JSON
        timestamp: Date.now()
      };

      await broadcastToTrip(tripId, message);
    } catch (error) {
      console.error(`Error broadcasting update for trip ${tripId}:`, error);
    }
  }

  // Broadcast presence updates
  public async broadcastPresence(tripId: string, userId: string, presence: any): Promise<void> {
    try {
      const message = {
        type: 'presence-update',
        tripId,
        userId,
        presence,
        timestamp: Date.now()
      };

      await broadcastToTrip(tripId, message);
    } catch (error) {
      console.error(`Error broadcasting presence for trip ${tripId}:`, error);
    }
  }

  // Clean up document when no longer needed
  public cleanupDocument(tripId: string): void {
    const doc = this.documents.get(tripId);
    if (doc) {
      doc.destroy();
      this.documents.delete(tripId);
    }
  }

  // Get all active documents (for monitoring)
  public getActiveDocuments(): string[] {
    return Array.from(this.documents.keys());
  }
}

// Export singleton instance
export const crdtService = new CRDTService();

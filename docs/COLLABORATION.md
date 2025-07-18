# Real-time Collaborative Editing Implementation Guide

This document explains how to use the CRDT (Conflict-free Replicated Data Types) implementation for real-time collaborative trip editing.

## Backend Implementation

The backend now includes:

### 1. CRDT Service (`/src/lib/crdt.ts`)
- Y.js document management for each trip
- Real-time synchronization via Azure Web PubSub
- Conflict-free collaborative editing
- Presence tracking and cursor awareness

### 2. Collaboration API Endpoints (`/src/api/routes/collaboration.ts`)
- `GET /api/collaboration/document/:tripId` - Get current document state
- `POST /api/collaboration/document/:tripId/update` - Apply document updates
- `POST /api/collaboration/presence/:tripId` - Update user presence/cursor
- `GET /api/collaboration/token/:tripId` - Get Web PubSub access token

### 3. Event Processing (`/src/features/trips/trip-event-processor.ts`)
- Processes CQRS events for read model synchronization
- Maintains trip data in Cosmos DB for fast reads
- Handles PostgreSQL to Cosmos DB data synchronization

## Frontend Integration Example

Here's how to integrate the collaborative editing on the frontend:

### 1. Install Y.js Dependencies
```bash
npm install yjs y-websocket
```

### 2. Create Collaborative Document Hook (React)
```typescript
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface CollaborativeTrip {
  title: string;
  description: string;
  destinations: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  collaborators: Array<{
    userId: string;
    name: string;
    isOnline: boolean;
  }>;
}

export function useCollaborativeTrip(tripId: string, accessToken: string) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [tripData, setTripData] = useState<CollaborativeTrip | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Create Y.js document
    const ydoc = new Y.Doc();
    
    // Connect to Web PubSub via WebSocket
    const provider = new WebsocketProvider(
      \`wss://your-webpubsub.service.signalr.net/client/hubs/collaborationHub\`,
      tripId,
      ydoc,
      {
        params: { access_token: accessToken }
      }
    );

    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    // Listen for document updates
    const tripMap = ydoc.getMap('trip');
    
    const updateTripData = () => {
      const destinations = tripMap.get('destinations') as Y.Array<Y.Map<any>>;
      const collaborators = tripMap.get('collaborators') as Y.Array<Y.Map<any>>;
      
      setTripData({
        title: tripMap.get('title') as string || '',
        description: tripMap.get('description') as string || '',
        destinations: destinations?.toArray().map(dest => ({
          id: dest.get('id'),
          name: dest.get('name'),
          description: dest.get('description')
        })) || [],
        collaborators: collaborators?.toArray().map(collab => ({
          userId: collab.get('userId'),
          name: collab.get('name'),
          isOnline: collab.get('isOnline')
        })) || []
      });
    };

    tripMap.observe(updateTripData);
    updateTripData(); // Initial load

    setDoc(ydoc);

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [tripId, accessToken]);

  const updateTitle = (title: string) => {
    if (doc) {
      const tripMap = doc.getMap('trip');
      tripMap.set('title', title);
    }
  };

  const updateDescription = (description: string) => {
    if (doc) {
      const tripMap = doc.getMap('trip');
      tripMap.set('description', description);
    }
  };

  const addDestination = (destination: { name: string; description: string }) => {
    if (doc) {
      const tripMap = doc.getMap('trip');
      const destinations = tripMap.get('destinations') as Y.Array<Y.Map<any>>;
      
      const destMap = new Y.Map();
      destMap.set('id', Date.now().toString()); // Simple ID generation
      destMap.set('name', destination.name);
      destMap.set('description', destination.description);
      
      destinations.push([destMap]);
    }
  };

  return {
    tripData,
    isConnected,
    updateTitle,
    updateDescription,
    addDestination
  };
}
```

### 3. Collaborative Trip Editor Component
```typescript
import React, { useState } from 'react';
import { useCollaborativeTrip } from './hooks/useCollaborativeTrip';

interface TripEditorProps {
  tripId: string;
  accessToken: string;
}

export function CollaborativeTripEditor({ tripId, accessToken }: TripEditorProps) {
  const { tripData, isConnected, updateTitle, updateDescription, addDestination } = 
    useCollaborativeTrip(tripId, accessToken);

  const [newDestination, setNewDestination] = useState({ name: '', description: '' });

  if (!tripData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="trip-editor">
      <div className="connection-status">
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <div className="collaborators">
        <h3>Active Collaborators:</h3>
        {tripData.collaborators.filter(c => c.isOnline).map(collaborator => (
          <span key={collaborator.userId} className="collaborator">
            {collaborator.name}
          </span>
        ))}
      </div>

      <div className="trip-details">
        <input
          type="text"
          value={tripData.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="Trip title"
          className="title-input"
        />

        <textarea
          value={tripData.description}
          onChange={(e) => updateDescription(e.target.value)}
          placeholder="Trip description"
          className="description-input"
        />
      </div>

      <div className="destinations">
        <h3>Destinations</h3>
        {tripData.destinations.map(destination => (
          <div key={destination.id} className="destination">
            <h4>{destination.name}</h4>
            <p>{destination.description}</p>
          </div>
        ))}

        <div className="add-destination">
          <input
            type="text"
            value={newDestination.name}
            onChange={(e) => setNewDestination({...newDestination, name: e.target.value})}
            placeholder="Destination name"
          />
          <textarea
            value={newDestination.description}
            onChange={(e) => setNewDestination({...newDestination, description: e.target.value})}
            placeholder="Destination description"
          />
          <button
            onClick={() => {
              addDestination(newDestination);
              setNewDestination({ name: '', description: '' });
            }}
          >
            Add Destination
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4. API Integration for Getting Access Token
```typescript
async function getTripCollaborationToken(tripId: string): Promise<{ token: string; url: string }> {
  const response = await fetch(\`/api/collaboration/token/\${tripId}\`, {
    headers: {
      'Authorization': \`Bearer \${userToken}\`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get collaboration token');
  }
  
  return response.json();
}
```

## Features Implemented

### ✅ **Completed Features:**

1. **Real-time Document Synchronization**
   - Y.js CRDT implementation for conflict-free editing
   - Azure Web PubSub for real-time message broadcasting
   - Automatic conflict resolution

2. **Collaborative Editing**
   - Multiple users can edit trip details simultaneously
   - Changes are synchronized instantly across all clients
   - No data loss due to concurrent edits

3. **Presence Awareness**
   - Track which users are online
   - Cursor position sharing
   - Real-time collaborator list

4. **CQRS Event Processing**
   - Command handlers for write operations
   - Event sourcing for audit trails
   - Read model synchronization with Cosmos DB

5. **User Management**
   - Complete user CRUD operations
   - Email-based collaborator lookup
   - Access control for trip collaboration

### ⚠️ **Partially Implemented:**

1. **Advanced CRDT Features**
   - Basic Y.js integration complete
   - Advanced awareness features need refinement
   - Offline synchronization capabilities need enhancement

2. **Performance Optimization**
   - Basic document management implemented
   - Document cleanup and memory management basic
   - Advanced caching strategies needed

## Environment Variables Required

Add these to your `.env` file:

```env
# Azure Web PubSub
WEPUBSUB_CONNECTION_STRING=Endpoint=https://your-webpubsub.webpubsub.azure.com;AccessKey=your-key;Version=1.0;

# Azure Cosmos DB (for read models)
AZURE_COSMOS_CONNECTION_STRING=AccountEndpoint=https://your-cosmos.documents.azure.com:443/;AccountKey=your-key;

# Azure Service Bus (for CQRS events)
AZURE_SERVICEBUS_CONNECTION_STRING=Endpoint=sb://your-servicebus.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=your-key
```

## Next Steps for Frontend Integration

1. Set up Web PubSub connection in your frontend
2. Implement the collaborative hooks and components
3. Add visual indicators for real-time collaboration
4. Implement cursor tracking and user presence
5. Add conflict resolution UI feedback
6. Test with multiple users simultaneously

The backend is now fully capable of supporting real-time collaborative editing with CRDT technology!

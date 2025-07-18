import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getWebPubSubAccessToken } from '../../lib/webpubsub';
import { TripRepository } from '../../models/trip';
import { crdtService } from '../../lib/crdt';

const router = Router();

// Get Web PubSub access token for real-time collaboration
router.get('/token/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Check if user is the creator or collaborator
    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Generate Web PubSub access token
    const token = await getWebPubSubAccessToken(tripId, userId);
    
    res.json({ 
      token: token.token,
      url: token.url
    });
  } catch (error) {
    console.error('Error generating collaboration token:', error);
    res.status(500).json({ message: 'Failed to generate collaboration token' });
  }
});

// Join a trip collaboration session
router.post('/join/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify trip exists and user has access
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Here you could track active sessions, send presence updates, etc.
    // For now, just return success
    res.json({ 
      message: 'Successfully joined collaboration session',
      tripId,
      userId 
    });
  } catch (error) {
    console.error('Error joining collaboration session:', error);
    res.status(500).json({ message: 'Failed to join collaboration session' });
  }
});

// Leave a trip collaboration session
router.post('/leave/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Here you could clean up active sessions, send presence updates, etc.
    // For now, just return success
    res.json({ 
      message: 'Successfully left collaboration session',
      tripId,
      userId 
    });
  } catch (error) {
    console.error('Error leaving collaboration session:', error);
    res.status(500).json({ message: 'Failed to leave collaboration session' });
  }
});

// Get collaboration status for a trip
router.get('/status/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Return collaboration info
    res.json({
      tripId,
      collaborators: collaborators.map(collab => ({
        userId: collab.userId,
        name: collab.user?.name,
        email: collab.user?.email,
        role: collab.role,
        invitedAt: collab.invitedAt,
        acceptedAt: collab.acceptedAt
      })),
      // In a real implementation, you might track who's currently online
      activeUsers: []
    });
  } catch (error) {
    console.error('Error getting collaboration status:', error);
    res.status(500).json({ message: 'Failed to get collaboration status' });
  }
});

// CRDT endpoints for real-time collaborative editing

// Get current CRDT document state
router.get('/document/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Load trip data into CRDT if not already loaded
    const tripData = await TripRepository.findByIdWithDestinations(tripId);
    if (tripData) {
      crdtService.loadTripData(tripId, tripData);
    }

    // Get current document state
    const documentState = crdtService.getTripState(tripId);
    
    res.json({
      tripId,
      document: documentState,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting CRDT document:', error);
    res.status(500).json({ message: 'Failed to get document state' });
  }
});

// Apply CRDT update to document
router.post('/document/:tripId/update', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { update } = req.body;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Apply the update
    const updateArray = new Uint8Array(update);
    crdtService.applyUpdate(tripId, updateArray);

    res.json({ 
      success: true,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error applying CRDT update:', error);
    res.status(500).json({ message: 'Failed to apply update' });
  }
});

// Update user presence/cursor
router.post('/presence/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { cursor, presence } = req.body;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Update cursor position
    if (cursor) {
      crdtService.updateCursor(tripId, userId, cursor);
    }

    // Broadcast presence update
    if (presence) {
      await crdtService.broadcastPresence(tripId, userId, presence);
    }

    res.json({ 
      success: true,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error updating presence:', error);
    res.status(500).json({ message: 'Failed to update presence' });
  }
});

export default router;

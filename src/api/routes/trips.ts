import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { TripRepository } from '../../models/trip';
import { TripCommands } from '../../features/trips/trip-commands';
import { z } from 'zod';
import { calculateRoute } from '../../lib/azure-maps';

const router = Router();

// Validation schemas
const NewTripSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const NewDestinationSchema = z.object({
  name: z.string().min(1),
  country: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  orderIndex: z.number().optional(),
});

const CollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']),
});

const RoutePlanSchema = z.object({
  coordinates: z.array(z.array(z.number()).length(2)), // Array of [longitude, latitude] pairs
  travelMode: z.enum(["car", "truck", "taxi", "bus", "van", "motorcycle", "bicycle", "pedestrian"]).optional(),
});

// Get all trips for the user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const trips = await TripRepository.findByUserId(req.user!.id);
    res.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
});

// Get a specific trip
router.get('/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const trip = await TripRepository.findByIdWithDestinations(req.params.tripId);
    if (trip && trip.createdBy === req.user!.id) {
      res.json(trip);
    } else {
      res.status(404).json({ message: 'Trip not found or access denied' });
    }
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ message: 'Failed to fetch trip' });
  }
});

// Create a new trip
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const newTripData = NewTripSchema.parse(req.body);
    const newTrip = await TripCommands.createTrip({
      ...newTripData,
      startDate: new Date(newTripData.startDate),
      endDate: new Date(newTripData.endDate),
      createdBy: req.user!.id,
    });
    res.status(201).json(newTrip);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid trip data', errors: error.issues });
    }
    console.error('Error creating trip:', error);
    res.status(500).json({ message: 'Failed to create trip' });
  }
});

// Update a trip
router.put('/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const trip = await TripRepository.findById(req.params.tripId);
    if (trip && trip.createdBy === req.user!.id) {
      const updatedTripData = NewTripSchema.parse(req.body);
      const updatedTrip = await TripCommands.updateTrip(req.params.tripId, {
        ...updatedTripData,
        startDate: new Date(updatedTripData.startDate),
        endDate: new Date(updatedTripData.endDate),
      }, req.user!.id);
      res.json(updatedTrip);
    } else {
      res.status(404).json({ message: 'Trip not found or access denied' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid trip data', errors: error.issues });
    }
    console.error('Error updating trip:', error);
    res.status(500).json({ message: 'Failed to update trip' });
  }
});

// Delete a trip
router.delete('/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    await TripCommands.deleteTrip(req.params.tripId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Failed to delete trip' });
  }
});

// Add a destination to a trip
router.post('/:tripId/destinations', requireAuth, async (req: Request, res: Response) => {
  try {
    const newDestinationData = NewDestinationSchema.parse(req.body);
    const updatedTrip = await TripCommands.addDestinationToTrip(req.params.tripId, newDestinationData, req.user!.id);
    if (updatedTrip) {
      res.status(201).json(updatedTrip);
    } else {
      res.status(404).json({ message: 'Trip not found or access denied' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid destination data', errors: error.issues });
    }
    console.error('Error adding destination:', error);
    res.status(500).json({ message: 'Failed to add destination' });
  }
});

// Update a destination
router.put('/:tripId/destinations/:destinationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const updatedDestinationData = NewDestinationSchema.parse(req.body);
    const updatedTrip = await TripCommands.updateDestination(req.params.tripId, req.params.destinationId, updatedDestinationData, req.user!.id);
    if (updatedTrip) {
      res.json(updatedTrip);
    } else {
      res.status(404).json({ message: 'Trip or destination not found or access denied' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid destination data', errors: error.issues });
    }
    console.error('Error updating destination:', error);
    res.status(500).json({ message: 'Failed to update destination' });
  }
});

// Remove a destination
router.delete('/:tripId/destinations/:destinationId', requireAuth, async (req: Request, res: Response) => {
  try {
    await TripCommands.removeDestination(req.params.tripId, req.params.destinationId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error removing destination:', error);
    res.status(500).json({ message: 'Failed to remove destination' });
  }
});

// Add a collaborator to a trip
router.post('/:tripId/collaborators', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email, role } = CollaboratorSchema.parse(req.body);
    await TripCommands.addCollaborator(req.params.tripId, email, role, req.user!.id);
    res.status(200).json({ message: 'Collaborator added' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid collaborator data', errors: error.issues });
    }
    console.error('Error adding collaborator:', error);
    res.status(500).json({ message: 'Failed to add collaborator' });
  }
});

// Remove a collaborator from a trip
router.delete('/:tripId/collaborators/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const trip = await TripRepository.findById(req.params.tripId);
    if (trip && trip.createdBy === req.user!.id) {
      await TripRepository.removeCollaborator(req.params.tripId, req.params.userId);
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Trip not found or access denied' });
    }
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ message: 'Failed to remove collaborator' });
  }
});

// Plan a route for a trip's destinations
router.post('/:tripId/route-plan', requireAuth, async (req: Request, res: Response) => {
  try {
    const { coordinates, travelMode } = RoutePlanSchema.parse(req.body);
    // In a real application, you might want to verify that these coordinates belong to the trip's destinations
    // For now, we'll just calculate the route based on the provided coordinates.
    const route = await calculateRoute(coordinates, travelMode);
    res.json(route);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid route planning data', errors: error.issues });
    }
    console.error('Error planning route:', error);
    res.status(500).json({ message: 'Failed to plan route' });
  }
});

export default router;
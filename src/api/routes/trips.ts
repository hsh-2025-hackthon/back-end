import { Router, Request, Response } from 'express';
import { validateJwt } from '../middleware/auth';

const router = Router();

interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
}

// Mock database
const trips: Trip[] = [];

// Get all trips
router.get('/', (req: Request, res: Response) => {
  res.json(trips);
});

// Get a trip by ID
router.get('/:id', (req: Request, res: Response) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (trip) {
    res.json(trip);
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

// Create a new trip
router.post('/', validateJwt, (req: Request, res: Response) => {
  const newTrip: Trip = { id: Date.now().toString(), ...req.body };
  trips.push(newTrip);
  res.status(201).json(newTrip);
});

// Update a trip
router.put('/:id', validateJwt, (req: Request, res: Response) => {
  const tripIndex = trips.findIndex(t => t.id === req.params.id);
  if (tripIndex > -1) {
    trips[tripIndex] = { ...trips[tripIndex], ...req.body };
    res.json(trips[tripIndex]);
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

// Delete a trip
router.delete('/:id', validateJwt, (req: Request, res: Response) => {
  const tripIndex = trips.findIndex(t => t.id === req.params.id);
  if (tripIndex > -1) {
    trips.splice(tripIndex, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

export default router;

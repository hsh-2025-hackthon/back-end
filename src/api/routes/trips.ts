import { Router } from 'express';
import { validateJwt } from '../middleware/auth';

const router = Router();

// Mock database
const trips = [];

// Get all trips
router.get('/', (req, res) => {
  res.json(trips);
});

// Get a trip by ID
router.get('/:id', (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (trip) {
    res.json(trip);
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

// Create a new trip
router.post('/', validateJwt, (req, res) => {
  const newTrip = { id: Date.now().toString(), ...req.body };
  trips.push(newTrip);
  res.status(201).json(newTrip);
});

// Update a trip
router.put('/:id', validateJwt, (req, res) => {
  const tripIndex = trips.findIndex(t => t.id === req.params.id);
  if (tripIndex > -1) {
    trips[tripIndex] = { ...trips[tripIndex], ...req.body };
    res.json(trips[tripIndex]);
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

// Delete a trip
router.delete('/:id', validateJwt, (req, res) => {
  const tripIndex = trips.findIndex(t => t.id === req.params.id);
  if (tripIndex > -1) {
    trips.splice(tripIndex, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ message: 'Trip not found' });
  }
});

export default router;

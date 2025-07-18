import { Trip } from '../../models/trip';

// Mock database
const trips: Trip[] = [];

export const createTrip = (trip: Omit<Trip, 'id' | 'status' | 'createdBy'>, userId: string): Trip => {
  const newTrip: Trip = {
    id: Date.now().toString(),
    status: 'planning',
    createdBy: userId,
    ...trip,
  };
  trips.push(newTrip);
  // In a real application, you would emit an event here.
  return newTrip;
};

export const addDestinationToTrip = (tripId: string, destination: any): Trip | undefined => {
  const trip = trips.find(t => t.id === tripId);
  if (trip) {
    trip.destination = destination;
    // In a real application, you would emit an event here.
  }
  return trip;
};

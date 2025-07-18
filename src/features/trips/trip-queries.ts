import { Trip } from '../../models/trip';

// Mock read model database (e.g., Cosmos DB)
const tripsReadModel: Trip[] = [];

export const getTripById = (tripId: string): Trip | undefined => {
  // In a real application, this would query Cosmos DB.
  return tripsReadModel.find(t => t.id === tripId);
};

export const getAllTrips = (): Trip[] => {
  return tripsReadModel;
};

// This function would be called by an event handler that listens to trip-related events.
export const updateReadModel = (trip: Trip) => {
  const existingTripIndex = tripsReadModel.findIndex(t => t.id === trip.id);
  if (existingTripIndex > -1) {
    tripsReadModel[existingTripIndex] = trip;
  } else {
    tripsReadModel.push(trip);
  }
};

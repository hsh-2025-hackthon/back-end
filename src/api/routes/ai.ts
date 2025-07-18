import { Router, Request, Response } from 'express';
import { generateItinerary } from '../../lib/openai';
import { validateJwt } from '../middleware/auth';

const router = Router();

interface ItineraryRequest extends Request {
  body: {
    destination: string;
    duration: number;
  };
}

router.post('/itinerary', validateJwt, async (req: ItineraryRequest, res: Response) => {
  const { destination, duration } = req.body;

  if (!destination || !duration) {
    return res.status(400).json({ message: 'destination and duration are required' });
  }

  try {
    const itinerary = await generateItinerary(destination, duration);
    if (itinerary) {
      res.json({ itinerary });
    } else {
      res.status(500).json({ message: 'Failed to generate itinerary' });
    }
  } catch (error) {
    console.error('Error in itinerary generation route:', error);
    res.status(500).json({ message: 'Failed to generate itinerary' });
  }
});

export default router;

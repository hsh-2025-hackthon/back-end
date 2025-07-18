import { Router } from 'express';
import { getWebPubSubAccessToken } from '../../lib/webpubsub';
import { validateJwt }f rom '../middleware/auth';

const router = Router();

router.post('/token', validateJwt, async (req, res) => {
  const { tripId } = req.body;
  // In a real app, you'd get the user ID from the decoded JWT
  const userId = (req as any).user?.id || 'mock-user';

  if (!tripId) {
    return res.status(400).json({ message: 'tripId is required' });
  }

  try {
    const token = await getWebPubSubAccessToken(tripId, userId);
    res.json(token);
  } catch (error) {
    console.error('Error getting Web PubSub token:', error);
    res.status(500).json({ message: 'Failed to get token' });
  }
});

export default router;

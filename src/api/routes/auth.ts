import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/auth/test
 * Test endpoint to verify Google OAuth authentication
 */
router.get('/test', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      message: 'Authentication successful!',
      user: req.user,
      provider: 'Google OAuth'
    });
  } catch (error) {
    console.error('Auth test error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/auth/status  
 * Check authentication status (optional auth)
 */
router.get('/status', optionalAuth, async (req: Request, res: Response) => {
  try {
    if (req.user) {
      res.json({
        authenticated: true,
        user: req.user,
        provider: 'Google OAuth'
      });
    } else {
      res.json({
        authenticated: false,
        message: 'Not authenticated'
      });
    }
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

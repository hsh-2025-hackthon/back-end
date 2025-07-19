import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { OAuth2Client } from 'google-auth-library';
import { UserRepository } from '../../models/user';

const router = Router();

const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required');
  }
  
  return new OAuth2Client(clientId, clientSecret);
};

/**
 * GET /api/auth/callback
 * Handle Google OAuth callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      return res.status(400).json({ 
        message: 'OAuth authentication failed',
        error: error as string 
      });
    }

    if (!code) {
      return res.status(400).json({ 
        message: 'Authorization code missing' 
      });
    }

    const client = getGoogleOAuthClient();
    
    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code as string);
    
    if (!tokens.id_token) {
      return res.status(400).json({ 
        message: 'ID token missing from OAuth response' 
      });
    }

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    if (!payload || !payload.email_verified) {
      return res.status(400).json({ 
        message: 'Invalid token or email not verified' 
      });
    }

    // Find or create user
    let user = await UserRepository.findByGoogleId(payload.sub);
    
    if (!user) {
      user = await UserRepository.create({
        name: payload.name || '',
        email: payload.email || '',
        googleId: payload.sub
      });
    }

    // Return the ID token for the client to use
    res.json({
      message: 'Authentication successful',
      token: tokens.id_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        googleId: user.googleId
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      message: 'Internal server error during authentication' 
    });
  }
});

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

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { UserRepository } from '../../models/user';

interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    googleId: string;
    email: string;
    name: string;
  };
}

const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is required');
  }
  
  return new OAuth2Client(clientId);
};

export const validateJwt = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token missing' });
    }

    // Initialize Google OAuth client
    const client = getGoogleOAuthClient();

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    // Extract user information from the payload
    const googleTokenPayload: GoogleTokenPayload = {
      sub: payload.sub,
      email: payload.email || '',
      name: payload.name || '',
      picture: payload.picture,
      email_verified: payload.email_verified,
      iss: payload.iss,
      aud: payload.aud as string,
      exp: payload.exp || 0,
      iat: payload.iat || 0,
    };

    // Validate email verification if required
    if (!googleTokenPayload.email_verified) {
      return res.status(401).json({ message: 'Email not verified' });
    }

    // Find or create user in database
    let user = await UserRepository.findByGoogleId(googleTokenPayload.sub);
    
    if (!user) {
      // Create user if doesn't exist
      user = await UserRepository.create({
        name: googleTokenPayload.name,
        email: googleTokenPayload.email,
        googleId: googleTokenPayload.sub
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      googleId: user.googleId!,
      email: user.email,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('Google OAuth validation error:', error);
    
    // Handle Google Auth specific errors
    if (error instanceof Error) {
      if (error.message.includes('Token used too early') || error.message.includes('Token expired')) {
        return res.status(401).json({ message: 'Token expired or invalid timing' });
      }
      
      if (error.message.includes('Invalid token signature') || error.message.includes('Invalid token')) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }
    
    return res.status(500).json({ message: 'Internal server error during authentication' });
  }
};

// Optional middleware for protecting routes that require authentication
export const requireAuth = validateJwt;

// Optional middleware for routes where authentication is optional
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without authentication
  }
  
  // If there's an auth header, validate it
  return validateJwt(req, res, next);
};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        googleId: string;
        email: string;
        name: string;
      };
    }
  }
}

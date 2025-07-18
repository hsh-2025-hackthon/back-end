import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UserRepository } from '../../models/user';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    azureAdId: string;
    email: string;
    name: string;
  };
}

const getJwksClient = () => {
  const tenantId = process.env.AZURE_AD_B2C_TENANT_ID || 'placeholder';
  const policyName = process.env.AZURE_AD_B2C_POLICY_NAME || 'B2C_1_signupsignin1';
  
  return jwksClient({
    jwksUri: `https://${tenantId}.b2clogin.com/${tenantId}.onmicrosoft.com/${policyName}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000 // 10 minutes
  });
};

const getSigningKey = (header: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    const client = getJwksClient();
    
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key?.getPublicKey();
        resolve(signingKey || '');
      }
    });
  });
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

    // Decode the token header to get the key id
    const decodedHeader = jwt.decode(token, { complete: true });
    
    if (!decodedHeader || !decodedHeader.header.kid) {
      return res.status(401).json({ message: 'Invalid token format' });
    }

    // Get the signing key
    const signingKey = await getSigningKey(decodedHeader.header);

    // Verify and decode the token
    const decoded = jwt.verify(token, signingKey, {
      algorithms: ['RS256']
    }) as JwtPayload;

    // Validate the issuer and audience
    const expectedIssuer = `https://${process.env.AZURE_AD_B2C_TENANT_ID}.b2clogin.com/${process.env.AZURE_AD_B2C_TENANT_ID}.onmicrosoft.com/${process.env.AZURE_AD_B2C_POLICY_NAME}/v2.0/`;
    const expectedAudience = process.env.AZURE_AD_B2C_CLIENT_ID;

    if (decoded.iss !== expectedIssuer) {
      return res.status(401).json({ message: 'Invalid token issuer' });
    }

    if (decoded.aud !== expectedAudience) {
      return res.status(401).json({ message: 'Invalid token audience' });
    }

    // Find or create user in database
    let user = await UserRepository.findByAzureAdId(decoded.sub);
    
    if (!user) {
      // Create user if doesn't exist
      user = await UserRepository.create({
        name: decoded.name,
        email: decoded.email,
        azureAdId: decoded.sub
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      azureAdId: user.azureAdId!,
      email: user.email,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token' });
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
        azureAdId: string;
        email: string;
        name: string;
      };
    }
  }
}

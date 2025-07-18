import { Request, Response, NextFunction } from 'express';

export const validateJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    // In a real application, you would validate the JWT here.
    // For this example, we'll just check if a token exists.
    if (token) {
      // You can also decode the token and attach user information to the request object.
      // For example: (req as any).user = decodedToken;
      return next();
    }
  }

  return res.status(401).json({ message: 'Unauthorized' });
};

import request from 'supertest';
import express from 'express';
import permissionsRouter from '../../../src/api/routes/permissions';
import { TripRepository } from '../../../src/models/trip';
import { PermissionService } from '../../../src/services/permission-service';

// Mock dependencies
jest.mock('../../../src/models/trip');
jest.mock('../../../src/services/permission-service');

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = { 
    id: 'user-123', 
    email: 'test@example.com',
    googleId: 'google-123',
    name: 'Test User'
  };
  next();
});

app.use('/api/trips', permissionsRouter);

describe('Permission Management API Integration Tests', () => {
  const mockTrip = {
    id: 'trip-123',
    title: 'Test Trip',
    description: 'A test trip for permissions',
    owner_id: 'user-123'
  };

  const mockPermissions = [
    {
      user_id: 'user-123',
      trip_id: 'trip-123',
      role: 'owner',
      user: { name: 'Test User', email: 'test@example.com' }
    },
    {
      user_id: 'user-456',
      trip_id: 'trip-123', 
      role: 'editor',
      user: { name: 'Editor User', email: 'editor@example.com' }
    }
  ];

  const mockTripRepository = TripRepository as jest.Mocked<any>;
  const mockPermissionService = PermissionService as jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockTripRepository.findById = jest.fn().mockResolvedValue(mockTrip);
    mockTripRepository.findUserRoleInTrip = jest.fn().mockResolvedValue('owner');
    
    mockPermissionService.prototype.getTripPermissions = jest.fn().mockResolvedValue(mockPermissions);
    mockPermissionService.prototype.updateUserPermission = jest.fn().mockResolvedValue(true);
    mockPermissionService.prototype.removeUserPermission = jest.fn().mockResolvedValue(true);
    mockPermissionService.prototype.bulkUpdatePermissions = jest.fn().mockResolvedValue(true);
    mockPermissionService.prototype.getEffectivePermissions = jest.fn().mockResolvedValue({
      canEdit: true,
      canDelete: true,
      canManagePermissions: true
    });
  });

  describe('GET /api/trips/:tripId/permissions', () => {
    it('should get trip permissions successfully', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/permissions')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockPermissions
      });
      expect(mockPermissionService.prototype.getTripPermissions).toHaveBeenCalledWith('trip-123');
    });

    it('should return 404 for non-existent trip', async () => {
      mockTripRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/non-existent/permissions')
        .expect(404);

      expect(response.body.error).toBe('Trip not found');
    });

    it('should return 403 for unauthorized user', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/trip-123/permissions')
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('PUT /api/trips/:tripId/permissions/:userId', () => {
    const updateData = {
      role: 'editor'
    };

    it('should update user permission successfully', async () => {
      const response = await request(app)
        .put('/api/trips/trip-123/permissions/user-456')
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Permission updated successfully'
      });
      expect(mockPermissionService.prototype.updateUserPermission).toHaveBeenCalledWith(
        'trip-123',
        'user-456',
        'editor'
      );
    });

    it('should require owner permission', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue('editor');

      const response = await request(app)
        .put('/api/trips/trip-123/permissions/user-456')
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Only trip owners can manage permissions');
    });

    it('should validate role value', async () => {
      const response = await request(app)
        .put('/api/trips/trip-123/permissions/user-456')
        .send({ role: 'invalid-role' })
        .expect(400);

      expect(response.body.error).toContain('role');
    });

    it('should prevent owner from changing their own role', async () => {
      const response = await request(app)
        .put('/api/trips/trip-123/permissions/user-123')
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Cannot modify your own permissions');
    });
  });

  describe('DELETE /api/trips/:tripId/permissions/:userId', () => {
    it('should remove user permission successfully', async () => {
      const response = await request(app)
        .delete('/api/trips/trip-123/permissions/user-456')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User removed from trip'
      });
      expect(mockPermissionService.prototype.removeUserPermission).toHaveBeenCalledWith(
        'trip-123',
        'user-456'
      );
    });

    it('should require owner permission', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue('editor');

      const response = await request(app)
        .delete('/api/trips/trip-123/permissions/user-456')
        .expect(403);

      expect(response.body.error).toBe('Only trip owners can manage permissions');
    });

    it('should prevent owner from removing themselves', async () => {
      const response = await request(app)
        .delete('/api/trips/trip-123/permissions/user-123')
        .expect(403);

      expect(response.body.error).toBe('Cannot remove yourself from the trip');
    });
  });

  describe('POST /api/trips/:tripId/permissions/bulk', () => {
    const bulkData = {
      updates: [
        { user_id: 'user-456', role: 'editor' },
        { user_id: 'user-789', role: 'viewer' }
      ]
    };

    it('should bulk update permissions successfully', async () => {
      const response = await request(app)
        .post('/api/trips/trip-123/permissions/bulk')
        .send(bulkData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Permissions updated successfully'
      });
      expect(mockPermissionService.prototype.bulkUpdatePermissions).toHaveBeenCalledWith(
        'trip-123',
        bulkData.updates
      );
    });

    it('should require owner permission', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue('editor');

      const response = await request(app)
        .post('/api/trips/trip-123/permissions/bulk')
        .send(bulkData)
        .expect(403);

      expect(response.body.error).toBe('Only trip owners can manage permissions');
    });

    it('should validate updates array', async () => {
      const response = await request(app)
        .post('/api/trips/trip-123/permissions/bulk')
        .send({ updates: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('updates');
    });
  });

  describe('GET /api/trips/:tripId/permissions/effective', () => {
    it('should get effective permissions successfully', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/permissions/effective')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          canEdit: true,
          canDelete: true,
          canManagePermissions: true
        }
      });
      expect(mockPermissionService.prototype.getEffectivePermissions).toHaveBeenCalledWith(
        'trip-123',
        'user-123'
      );
    });

    it('should return 404 for non-existent trip', async () => {
      mockTripRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/non-existent/permissions/effective')
        .expect(404);

      expect(response.body.error).toBe('Trip not found');
    });
  });

  describe('Error handling', () => {
    it('should handle permission service errors', async () => {
      mockPermissionService.prototype.getTripPermissions.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/trips/trip-123/permissions')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should handle invalid trip ID format', async () => {
      const response = await request(app)
        .get('/api/trips/invalid-id-format/permissions')
        .expect(400);

      expect(response.body.error).toContain('Invalid trip ID');
    });

    it('should handle invalid user ID format', async () => {
      const response = await request(app)
        .put('/api/trips/trip-123/permissions/invalid-user-id')
        .send({ role: 'editor' })
        .expect(400);

      expect(response.body.error).toContain('Invalid user ID');
    });
  });
});

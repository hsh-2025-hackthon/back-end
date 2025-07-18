import { CircuitBreaker, CircuitState, CircuitBreakerManager } from '../../../src/lib/circuit-breaker';

describe('CircuitBreaker Unit Tests', () => {
  let circuitBreaker: CircuitBreaker;
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
    circuitBreaker = manager.createCircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000, // 1 second for faster testing
      monitoringPeriod: 5000, // 5 seconds
      successThreshold: 2,
      timeout: 500, // 500ms timeout
      name: 'test-service'
    });
  });

  describe('Circuit Breaker States', () => {
    it('should start in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Trigger enough failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failureCount).toBe(3);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      const successOperation = jest.fn().mockResolvedValue('success');
      
      // First attempt should transition to HALF_OPEN
      await circuitBreaker.execute(successOperation);
      
      // After one success, it should still be HALF_OPEN (needs 2 successes)
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition to CLOSED after enough successes in HALF_OPEN', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const successOperation = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute successful operations to close circuit
      await circuitBreaker.execute(successOperation);
      await circuitBreaker.execute(successOperation);

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successCount).toBe(2);
    });

    it('should return to OPEN if failure occurs in HALF_OPEN', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const successOperation = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // First success should move to HALF_OPEN
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getStats().state).toBe(CircuitState.HALF_OPEN);

      // Failure in HALF_OPEN should return to OPEN
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);
    });
  });

  describe('Operation Execution', () => {
    it('should execute successful operations normally', async () => {
      const successOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(successOperation);
      
      expect(result).toBe('success');
      expect(successOperation).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should handle and count failed operations', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        expect((error as Error).message).toBe('Operation failed');
      }
      
      expect(failingOperation).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should fail fast when circuit is OPEN', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      // This should fail fast without calling the operation
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        expect((error as Error).message).toContain('Circuit breaker test-service is OPEN - failing fast');
      }

      // Operation should not be called again (still 3 times from before)
      expect(failingOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle operation timeouts', async () => {
      const slowOperation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000)) // Takes 1 second
      );

      try {
        await circuitBreaker.execute(slowOperation);
      } catch (error) {
        expect((error as Error).message).toContain('Operation timeout after 500ms');
      }

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track comprehensive statistics', async () => {
      const successOperation = jest.fn().mockResolvedValue('success');
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Execute some operations
      await circuitBreaker.execute(successOperation);
      await circuitBreaker.execute(successOperation);
      
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should calculate uptime correctly', async () => {
      const stats = circuitBreaker.getStats();
      
      // With no failures, uptime should be 100%
      expect(stats.uptime).toBe(100);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual reset', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      // Manual reset
      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    it('should allow manual force open', () => {
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED);

      circuitBreaker.forceOpen();

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttempt).toBeInstanceOf(Date);
    });
  });

  describe('CircuitBreakerManager', () => {
    it('should create and manage multiple circuit breakers', () => {
      const cb1 = manager.createCircuitBreaker('service1');
      const cb2 = manager.createCircuitBreaker('service2');

      expect(cb1).not.toBe(cb2);
      expect(manager.getCircuitBreaker('service1')).toBe(cb1);
      expect(manager.getCircuitBreaker('service2')).toBe(cb2);
      expect(manager.getCircuitBreaker('nonexistent')).toBeUndefined();
    });

    it('should collect stats from all circuit breakers', async () => {
      const cb1 = manager.createCircuitBreaker('service1');
      const cb2 = manager.createCircuitBreaker('service2');

      const successOperation = jest.fn().mockResolvedValue('success');
      await cb1.execute(successOperation);
      await cb2.execute(successOperation);

      const allStats = manager.getAllStats();

      expect(allStats).toHaveProperty('service1');
      expect(allStats).toHaveProperty('service2');
      expect(allStats.service1.successCount).toBe(1);
      expect(allStats.service2.successCount).toBe(1);
    });

    it('should identify healthy and unhealthy systems', async () => {
      const cb1 = manager.createCircuitBreaker('healthy-service');
      const cb2 = manager.createCircuitBreaker('unhealthy-service', {
        failureThreshold: 1,
        resetTimeout: 10000
      });

      const successOperation = jest.fn().mockResolvedValue('success');
      const failingOperation = jest.fn().mockRejectedValue(new Error('fail'));

      // Keep one healthy
      await cb1.execute(successOperation);

      // Make one unhealthy
      try {
        await cb2.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      const healthy = manager.getHealthySystems();
      const unhealthy = manager.getUnhealthySystems();

      expect(healthy).toContain('healthy-service');
      expect(unhealthy).toContain('unhealthy-service');
    });

    it('should reset all circuit breakers', async () => {
      const cb1 = manager.createCircuitBreaker('service1', { failureThreshold: 1 });
      const cb2 = manager.createCircuitBreaker('service2', { failureThreshold: 1 });

      const failingOperation = jest.fn().mockRejectedValue(new Error('fail'));

      // Open both circuits by failing them individually
      try {
        await cb1.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      try {
        await cb2.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      expect(cb1.getStats().state).toBe(CircuitState.OPEN);
      expect(cb2.getStats().state).toBe(CircuitState.OPEN);

      // Reset all
      manager.resetAll();

      expect(cb1.getStats().state).toBe(CircuitState.CLOSED);
      expect(cb2.getStats().state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive calls', async () => {
      const slowOperation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('success'), 10))
      );

      // Execute multiple operations in parallel
      const promises = Array(10).fill(null).map(() => 
        circuitBreaker.execute(slowOperation)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every(r => r === 'success')).toBe(true);
      expect(circuitBreaker.getStats().totalRequests).toBe(10);
    });

    it('should handle operations that throw non-Error objects', async () => {
      const weirdFailingOperation = jest.fn().mockRejectedValue('string error');

      try {
        await circuitBreaker.execute(weirdFailingOperation);
      } catch (error) {
        expect(typeof error).toBe('string');
      }

      expect(circuitBreaker.getStats().failureCount).toBe(1);
    });

    it('should handle monitoring period window correctly', async () => {
      const cb = manager.createCircuitBreaker('window-test', {
        failureThreshold: 2,
        monitoringPeriod: 100, // Very short window
        resetTimeout: 1000
      });

      const failingOperation = jest.fn().mockRejectedValue(new Error('fail'));

      // First failure
      try {
        await cb.execute(failingOperation);
      } catch (error) {
        // Expected
      }

      // Wait for monitoring window to pass
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second failure (should not open circuit because first failure is outside window)
      try {
        await cb.execute(failingOperation);
      } catch (error) {
        // Expected
      }

      // Should still be closed because failures are in different monitoring windows
      expect(cb.getStats().state).toBe(CircuitState.CLOSED);
    });
  });
});
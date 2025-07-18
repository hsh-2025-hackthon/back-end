import express from 'express';
import { serviceHealthManager } from '../../lib/service-health';

const router = express.Router();

// Get overall health status
router.get('/', async (req, res) => {
  try {
    const healthChecks = await serviceHealthManager.getServiceHealth() as any[];
    const summary = serviceHealthManager.getHealthSummary();
    
    const overallStatus = summary.unhealthy > 0 ? 'degraded' : 
                         summary.unknown > 0 ? 'unknown' : 'healthy';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({ 
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      summary,
      services: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get detailed service health
router.get('/services', async (req, res) => {
  try {
    const healthChecks = await serviceHealthManager.getServiceHealth() as any[];
    res.json({
      timestamp: new Date().toISOString(),
      services: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get service health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get health for a specific service
router.get('/services/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const health = await serviceHealthManager.getServiceHealth(serviceName) as any;
    
    if (!health || (Array.isArray(health) && health.length === 0)) {
      return res.status(404).json({
        error: 'Service not found',
        service: serviceName
      });
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      service: health
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get service health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Azure-specific services health
router.get('/azure', async (req, res) => {
  try {
    const allHealth = await serviceHealthManager.getServiceHealth() as any[];
    const azureServices = allHealth.filter(service => 
      service.service.includes('Azure') || 
      service.service.includes('Cosmos') ||
      service.service.includes('Event Hubs') ||
      service.service.includes('Web PubSub')
    );
    
    const azureSummary = {
      total: azureServices.length,
      healthy: azureServices.filter(s => s.status === 'healthy').length,
      unhealthy: azureServices.filter(s => s.status === 'unhealthy').length,
      unknown: azureServices.filter(s => s.status === 'unknown').length
    };
    
    const overallStatus = azureSummary.unhealthy > 0 ? 'degraded' : 
                         azureSummary.unknown > 0 ? 'unknown' : 'healthy';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: azureSummary,
      services: azureServices
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get Azure service health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MCP services health
router.get('/mcp', async (req, res) => {
  try {
    const allHealth = await serviceHealthManager.getServiceHealth() as any[];
    const mcpServices = allHealth.filter(service => service.service.startsWith('MCP '));
    
    const mcpSummary = {
      total: mcpServices.length,
      healthy: mcpServices.filter(s => s.status === 'healthy').length,
      unhealthy: mcpServices.filter(s => s.status === 'unhealthy').length,
      unknown: mcpServices.filter(s => s.status === 'unknown').length
    };
    
    const overallStatus = mcpSummary.unhealthy > 0 ? 'degraded' : 
                         mcpSummary.unknown > 0 ? 'unknown' : 'healthy';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: mcpSummary,
      services: mcpServices
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get MCP service health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Force refresh all health checks
router.post('/refresh', async (req, res) => {
  try {
    console.log('Manual health check refresh requested');
    const healthChecks = await serviceHealthManager.checkAllServices();
    const summary = serviceHealthManager.getHealthSummary();
    
    res.json({
      message: 'Health checks refreshed',
      timestamp: new Date().toISOString(),
      summary,
      services: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to refresh health checks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

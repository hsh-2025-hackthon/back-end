// Test file to validate the service health implementation
import { serviceHealthManager } from './src/lib/service-health';

async function testServiceHealth() {
  console.log('Testing service health manager...');
  
  try {
    // Test getting all service health
    console.log('\n1. Testing all services health check:');
    const allHealth = await serviceHealthManager.checkAllServices();
    console.log(`Found ${allHealth.length} services`);
    
    allHealth.forEach(service => {
      const statusIcon = service.status === 'healthy' ? '✅' : 
                        service.status === 'unhealthy' ? '❌' : '❓';
      console.log(`   ${statusIcon} ${service.service}`);
      if (service.message) {
        console.log(`      └─ ${service.message}`);
      }
    });
    
    // Test summary
    console.log('\n2. Testing health summary:');
    const summary = serviceHealthManager.getHealthSummary();
    console.log(`   Total: ${summary.total}, Healthy: ${summary.healthy}, Unhealthy: ${summary.unhealthy}, Unknown: ${summary.unknown}`);
    
    // Test individual service
    console.log('\n3. Testing individual service health:');
    const azureOpenAIHealth = await serviceHealthManager.getServiceHealth('Azure OpenAI');
    console.log('Azure OpenAI health:', azureOpenAIHealth);
    
    console.log('\n✅ Service health manager test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testServiceHealth();

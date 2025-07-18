import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'test' });
});

describe('Simple Test', () => {
  it('should work', async () => {
    const response = await request(app)
      .get('/test')
      .expect(200);

    expect(response.body.message).toBe('test');
  });
});

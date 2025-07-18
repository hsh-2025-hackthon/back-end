#!/usr/bin/env node

/**
 * Manual test script for CSV export endpoint
 * Usage: node test-csv-export.js
 */

const http = require('http');

// Test data
const tripId = '123e4567-e89b-12d3-a456-426614174000';
const serverPort = 3000;

function makeRequest() {
  const options = {
    hostname: 'localhost',
    port: serverPort,
    path: `/api/trips/${tripId}/expenses/export/csv`,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Response body:');
      console.log(data);
    });
  });

  req.on('error', (e) => {
    console.error(`Request error: ${e.message}`);
  });

  req.end();
}

// Test the endpoint
console.log(`Testing CSV export endpoint: GET /api/trips/${tripId}/expenses/export/csv`);
makeRequest();

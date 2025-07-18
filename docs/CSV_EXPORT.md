# CSV Export Feature Documentation

## Overview

The CSV export feature allows users to export all expenses for a trip in CSV (Comma-Separated Values) format. This feature is useful for:

- External expense analysis and reporting
- Integration with accounting software
- Backup and archival purposes
- Data sharing with team members or stakeholders

## API Endpoint

```
GET /api/trips/{tripId}/expenses/export/csv
```

### Authentication

- Requires valid JWT Bearer token
- User must have access to the specified trip

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | UUID | The unique identifier of the trip |

### Response

**Success (200 OK)**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="trip-{tripId}-expenses-{date}.csv"`
- Body: CSV file content

**Error Responses**
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User does not have access to the specified trip
- `404 Not Found`: Trip does not exist
- `500 Internal Server Error`: Server error during export generation

## CSV Format

The exported CSV file contains the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| Date | Expense date (YYYY-MM-DD format) | `2025-07-19` |
| Title | Expense title | `Dinner at Restaurant` |
| Description | Optional expense description | `Team dinner with clients` |
| Amount | Expense amount in original currency | `150.00` |
| Currency | Original currency code | `USD` |
| Base Amount | Amount converted to base currency | `135.75` |
| Base Currency | Base currency for the trip | `EUR` |
| Category | Expense category | `Food` |
| Subcategory | Optional subcategory | `Restaurant` |
| Payer | Name of the person who paid | `John Smith` |
| Created By | Name of the person who created the expense | `Jane Doe` |
| Split Method | How the expense is split | `equal` |
| Participants | Number or description of participants | `4 participants` |
| Status | Expense status | `active` |
| Verification Status | Verification state | `verified` |
| Location | Expense location (if available) | `"123 Main St, City"` |
| Tags | Comma-separated tags | `"business; dinner; clients"` |

## Example Usage

### cURL Request

```bash
curl -X GET \
  'https://api.example.com/api/trips/123e4567-e89b-12d3-a456-426614174000/expenses/export/csv' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Accept: text/csv' \
  -o trip-expenses.csv
```

### JavaScript/Fetch

```javascript
const response = await fetch(`/api/trips/${tripId}/expenses/export/csv`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'text/csv'
  }
});

if (response.ok) {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trip-expenses.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
```

## Implementation Details

### Security Considerations

- Access control is enforced through trip membership verification
- User authentication is required via JWT tokens
- No sensitive financial data is exposed beyond what the user already has access to

### Performance Considerations

- Large expense datasets are processed efficiently
- CSV generation is performed synchronously for immediate download
- Memory usage is optimized for reasonable dataset sizes

### Error Handling

- Comprehensive error handling for authentication, authorization, and data access
- Graceful degradation when expense data is incomplete
- CSV escaping prevents injection attacks and data corruption

## Feature Status

✅ **Implemented Features:**
- Complete CSV export functionality
- Proper CSV escaping and formatting
- Access control and authentication
- Comprehensive expense data inclusion
- Timestamped filename generation
- Integration tests

🔄 **Future Enhancements:**
- Filtering options (date range, category, etc.)
- Custom column selection
- Multiple export formats (Excel, JSON)
- Asynchronous export for very large datasets
- Email delivery option for large exports

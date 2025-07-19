# Collaborative Travel Planner API Documentation

## Overview
This document describes the API for the Collaborative Travel Planner application. It allows users to create, manage, and share travel itineraries. The API supports real-time collaboration features through WebSockets. Authentication is handled via JWT Bearer tokens obtained from Google OAuth.

**Version:** 1.0.0
**Base URL:** `/api`

## Authentication
All authenticated endpoints require a JWT Bearer token in the `Authorization` header.

## Endpoints

### Trips

#### Get all trips for the user
`GET /trips`
- **Summary:** Retrieves a list of all trips associated with the authenticated user.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: A list of trips.
    ```json
    [
      {
        "id": "string (uuid)",
        "name": "string",
        "startDate": "string (date)",
        "endDate": "string (date)",
        "ownerId": "string",
        "collaborators": [
          {
            "userId": "string",
            "role": "string"
          }
        ],
        "destinations": [
          {
            "id": "string (uuid)",
            "name": "string",
            "latitude": "number",
            "longitude": "number",
            "arrivalDate": "string (date)",
            "departureDate": "string (date)"
          }
        ]
      }
    ]
    ```

#### Create a new trip
`POST /trips`
- **Summary:** Creates a new trip with the provided details.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "name": "string",
    "startDate": "string (date)",
    "endDate": "string (date)"
  }
  ```
- **Responses:**
  - `201 Created`: Trip created successfully.
    ```json
    {
      "id": "string (uuid)",
      "name": "string",
      "startDate": "string (date)",
      "endDate": "string (date)",
      "ownerId": "string",
      "collaborators": [],
      "destinations": []
    }
    ```

#### Get a specific trip
`GET /trips/{tripId}`
- **Summary:** Retrieves the details of a single trip by its ID.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: The requested trip.
    ```json
    {
      "id": "string (uuid)",
      "name": "string",
      "startDate": "string (date)",
      "endDate": "string (date)",
      "ownerId": "string",
      "collaborators": [],
      "destinations": []
    }
    ```

#### Update a trip
`PUT /trips/{tripId}`
- **Summary:** Updates the details of an existing trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "name": "string",
    "startDate": "string (date)",
    "endDate": "string (date)"
  }
  ```
- **Responses:**
  - `200 OK`: The updated trip.
    ```json
    {
      "id": "string (uuid)",
      "name": "string",
      "startDate": "string (date)",
      "endDate": "string (date)",
      "ownerId": "string",
      "collaborators": [],
      "destinations": []
    }
    ```

#### Delete a trip
`DELETE /trips/{tripId}`
- **Summary:** Deletes a trip by its ID.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `204 No Content`: Trip deleted successfully.

#### Add a destination to a trip
`POST /trips/{tripId}/destinations`
- **Summary:** Add a destination to a trip
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "name": "string",
    "latitude": "number",
    "longitude": "number",
    "arrivalDate": "string (date)",
    "departureDate": "string (date)"
  }
  ```
- **Responses:**
  - `201 Created`: Destination added.
    ```json
    {
      "id": "string (uuid)",
      "name": "string",
      "startDate": "string (date)",
      "endDate": "string (date)",
      "ownerId": "string",
      "collaborators": [],
      "destinations": []
    }
    ```

#### Update a destination
`PUT /trips/{tripId}/destinations/{destinationId}`
- **Summary:** Update a destination
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `destinationId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "name": "string",
    "latitude": "number",
    "longitude": "number",
    "arrivalDate": "string (date)",
    "departureDate": "string (date)"
  }
  ```
- **Responses:**
  - `200 OK`: Destination updated.
    ```json
    {
      "id": "string (uuid)",
      "name": "string",
      "startDate": "string (date)",
      "endDate": "string (date)",
      "ownerId": "string",
      "collaborators": [],
      "destinations": []
    }
    ```

#### Remove a destination
`DELETE /trips/{tripId}/destinations/{destinationId}`
- **Summary:** Remove a destination
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `destinationId` (path): `string` (uuid) - Required.
- **Responses:**
  - `204 No Content`: Destination removed.

#### Add a collaborator to a trip
`POST /trips/{tripId}/collaborators`
- **Summary:** Add a collaborator to a trip
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "userId": "string",
    "role": "string"
  }
  ```
- **Responses:**
  - `200 OK`: Collaborator added.

#### Remove a collaborator from a trip
`DELETE /trips/{tripId}/collaborators/{userId}`
- **Summary:** Remove a collaborator from a trip
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `userId` (path): `string` - Required.
- **Responses:**
  - `204 No Content`: Collaborator removed.

#### Plan a route for a trip's destinations
`POST /trips/{tripId}/route-plan`
- **Summary:** Calculates an optimized route based on a list of coordinates for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "coordinates": [
      {
        "latitude": "number",
        "longitude": "number"
      }
    ],
    "optimize": "boolean"
  }
  ```
- **Responses:**
  - `200 OK`: Route plan successfully generated.
    ```json
    {
      "route": [
        {
          "latitude": "number",
          "longitude": "number"
        }
      ],
      "distance": "number",
      "duration": "number"
    }
    ```
  - `400 Bad Request`: Invalid route planning data.

### Users

#### Get current user profile
`GET /users/me`
- **Summary:** Retrieves the profile of the currently authenticated user.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: Current user profile.
    ```json
    {
      "id": "string",
      "email": "string (email)",
      "name": "string",
      "profilePicture": "string (url)"
    }
    ```

#### Update current user profile
`PUT /users/me`
- **Summary:** Updates the profile of the currently authenticated user.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "name": "string",
    "profilePicture": "string (url)"
  }
  ```
- **Responses:**
  - `200 OK`: Updated user profile.
    ```json
    {
      "id": "string",
      "email": "string (email)",
      "name": "string",
      "profilePicture": "string (url)"
    }
    ```

#### Search users
`GET /users`
- **Summary:** Search for users by name or email (for collaboration features).
- **Security:** `bearerAuth`
- **Parameters:**
  - `search` (query): `string` - Search term to match against user names or emails.
  - `limit` (query): `integer` (min: 1, max: 50, default: 20) - Maximum number of results to return.
  - `offset` (query): `integer` (min: 0, default: 0) - Number of results to skip.
- **Responses:**
  - `200 OK`: List of users matching the search criteria.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "profilePicture": "string (url)"
      }
    ]
    ```

#### Get user by ID
`GET /users/{id}`
- **Summary:** Retrieves a user's public profile by their ID.
- **Parameters:**
  - `id` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: User's public profile.
    ```json
    {
      "id": "string",
      "name": "string",
      "profilePicture": "string (url)"
    }
    ```

### Collaboration

#### Get a Web PubSub access token
`GET /collaboration/token/{tripId}`
- **Summary:** Get a Web PubSub access token
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Web PubSub access token.
    ```json
    {
      "token": "string",
      "url": "string"
    }
    ```

#### Add a member to a trip
`POST /trips/{tripId}/members`
- **Summary:** Adds a member to a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "userId": "string",
    "role": "member" | "admin"
  }
  ```
- **Responses:**
  - `200 OK`: Member added successfully.

#### Remove a member from a trip
`DELETE /trips/{tripId}/members/{userId}`
- **Summary:** Removes a member from a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `userId` (path): `string` - Required.
- **Responses:**
  - `204 No Content`: Member removed successfully.

### Itinerary

#### Get trip itinerary
`GET /trips/{tripId}/itinerary`
- **Summary:** Retrieves the detailed itinerary for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Trip itinerary.
    ```json
    {
      "tripId": "string",
      "days": [
        {
          "date": "string (date)",
          "activities": [
            {
              "id": "string",
              "name": "string",
              "time": "string",
              "location": "string",
              "description": "string"
            }
          ]
        }
      ]
    }
    ```

#### Get smart itinerary cards
`GET /trips/{tripId}/smart-cards`
- **Summary:** Retrieves enriched itinerary cards with real-time data for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Smart itinerary cards with enriched data.
    ```json
    {
      "success": "boolean",
      "tripId": "string",
      "totalCards": "integer",
      "cards": [
        {
          "id": "string",
          "type": "string",
          "title": "string",
          "description": "string",
          "data": "object",
          "lastUpdated": "string (date-time)"
        }
      ],
      "generatedAt": "string (date-time)"
    }
    ```

#### Refresh smart card data
`POST /trips/{tripId}/smart-cards/{cardId}/refresh`
- **Summary:** Refreshes enriched data for a specific itinerary card.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `cardId` (path): `string` - Required.
- **Responses:**
  - `200 OK`: Refreshed smart card data.
    ```json
    {
      "success": "boolean",
      "cardId": "string",
      "card": {
        "id": "string",
        "type": "string",
        "title": "string",
        "description": "string",
        "data": "object",
        "lastUpdated": "string (date-time)"
      },
      "refreshedAt": "string (date-time)"
    }
    ```

#### Get smart cards summary
`GET /trips/{tripId}/smart-cards/summary`
- **Summary:** Retrieves a summary of all smart cards for a trip with analytics.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Smart cards summary and analytics.
    ```json
    {
      "success": "boolean",
      "tripId": "string",
      "summary": {
        "totalCards": "integer",
        "cardsByType": "object",
        "alerts": "integer",
        "recommendations": "integer"
      },
      "generatedAt": "string (date-time)"
    }
    ```

### Chat

#### Get chat rooms for a trip
`GET /trips/{tripId}/chat/rooms`
- **Summary:** Retrieves a list of chat rooms for a specific trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of chat rooms.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "description": "string",
        "tripId": "string",
        "createdAt": "string (date-time)"
      }
    ]
    ```

#### Create a new chat room
`POST /trips/{tripId}/chat/rooms`
- **Summary:** Creates a new chat room for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "name": "string",
    "description": "string"
  }
  ```
- **Responses:**
  - `201 Created`: Chat room created successfully.
    ```json
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "tripId": "string",
      "createdAt": "string (date-time)"
    }
    ```

#### Update a chat room
`PUT /chat/rooms/{roomId}`
- **Summary:** Updates an existing chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "name": "string",
    "description": "string"
  }
  ```
- **Responses:**
  - `200 OK`: Chat room updated successfully.
    ```json
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "tripId": "string",
      "createdAt": "string (date-time)"
    }
    ```

#### Delete a chat room
`DELETE /chat/rooms/{roomId}`
- **Summary:** Deletes a chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
- **Responses:**
  - `204 No Content`: Chat room deleted successfully.

#### Get messages from a chat room
`GET /chat/rooms/{roomId}/messages`
- **Summary:** Retrieves messages from a specific chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
  - `limit` (query): `integer` - Maximum number of messages to retrieve.
  - `offset` (query): `integer` - Offset for pagination.
- **Responses:**
  - `200 OK`: List of chat messages.
    ```json
    [
      {
        "id": "string",
        "roomId": "string",
        "senderId": "string",
        "content": "string",
        "timestamp": "string (date-time)",
        "message_type": "text" | "system" | "ai_suggestion" | "vote",
        "metadata": "object"
      }
    ]
    ```

#### Send a new message to a chat room
`POST /chat/rooms/{roomId}/messages`
- **Summary:** Sends a new message to a chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "content": "string",
    "message_type": "text" | "system" | "ai_suggestion" | "vote",
    "metadata": "object"
  }
  ```
- **Responses:**
  - `201 Created`: Message sent successfully.
    ```json
    {
      "id": "string",
      "roomId": "string",
      "senderId": "string",
      "content": "string",
      "timestamp": "string (date-time)",
      "message_type": "text" | "system" | "ai_suggestion" | "vote",
      "metadata": "object"
    }
    ```

#### Edit an existing message
`PUT /chat/messages/{messageId}`
- **Summary:** Edits an existing message.
- **Security:** `bearerAuth`
- **Parameters:**
  - `messageId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "content": "string"
  }
  ```
- **Responses:**
  - `200 OK`: Message updated successfully.
    ```json
    {
      "id": "string",
      "roomId": "string",
      "senderId": "string",
      "content": "string",
      "timestamp": "string (date-time)",
      "message_type": "text" | "system" | "ai_suggestion" | "vote",
      "metadata": "object"
    }
    ```

#### Delete a message
`DELETE /chat/messages/{messageId}`
- **Summary:** Deletes a message.
- **Security:** `bearerAuth`
- **Parameters:**
  - `messageId` (path): `string` (uuid) - Required.
- **Responses:**
  - `204 No Content`: Message deleted successfully.

#### Get members in a chat room
`GET /chat/rooms/{roomId}/members`
- **Summary:** Retrieves a list of members in a chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of chat room members.
    ```json
    [
      {
        "userId": "string",
        "role": "member" | "admin" | "viewer"
      }
    ]
    ```

#### Add a member to a chat room
`POST /chat/rooms/{roomId}/members`
- **Summary:** Adds a member to a chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "userId": "string",
    "role": "member" | "admin" | "viewer"
  }
  ```
- **Responses:**
  - `200 OK`: Member added successfully.

#### Remove a member from a chat room
`DELETE /chat/rooms/{roomId}/members/{userId}`
- **Summary:** Removes a member from a chat room.
- **Security:** `bearerAuth`
- **Parameters:**
  - `roomId` (path): `string` (uuid) - Required.
  - `userId` (path): `string` - Required.
- **Responses:**
  - `204 No Content`: Member removed successfully.

### Voting

#### Create a new vote for a trip
`POST /trips/{tripId}/votes`
- **Summary:** Creates a new vote for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "title": "string",
    "options": [
      {
        "id": "string",
        "text": "string"
      }
    ],
    "deadline": "string (date-time)"
  }
  ```
- **Responses:**
  - `201 Created`: Vote created successfully.
    ```json
    {
      "id": "string",
      "tripId": "string",
      "title": "string",
      "options": [],
      "deadline": "string (date-time)",
      "status": "string"
    }
    ```

#### Get all votes for a trip
`GET /trips/{tripId}/votes`
- **Summary:** Retrieves all active and past votes for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of votes.
    ```json
    [
      {
        "id": "string",
        "tripId": "string",
        "title": "string",
        "options": [],
        "deadline": "string (date-time)",
        "status": "string"
      }
    ]
    ```

#### Get a specific vote
`GET /votes/{voteId}`
- **Summary:** Retrieves details of a specific vote.
- **Security:** `bearerAuth`
- **Parameters:**
  - `voteId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Vote details.
    ```json
    {
      "id": "string",
      "tripId": "string",
      "title": "string",
      "options": [],
      "deadline": "string (date-time)",
      "status": "string"
    }
    ```

#### Submit a user's response to a vote
`POST /votes/{voteId}/responses`
- **Summary:** Submits a user's response to a vote.
- **Security:** `bearerAuth`
- **Parameters:**
  - `voteId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "userId": "string",
    "optionId": "string"
  }
  ```
- **Responses:**
  - `201 Created`: Vote response submitted successfully.
    ```json
    {
      "voteId": "string",
      "userId": "string",
      "optionId": "string",
      "timestamp": "string (date-time)"
    }
    ```

#### Get vote results
`GET /votes/{voteId}/results`
- **Summary:** Retrieves the current results of a vote.
- **Security:** `bearerAuth`
- **Parameters:**
  - `voteId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Vote results.
    ```json
    {
      "voteId": "string",
      "results": [
        {
          "optionId": "string",
          "votes": "integer"
        }
      ],
      "totalVotes": "integer"
    }
    ```

### Expenses

#### Get all expenses for a trip
`GET /trips/{tripId}/expenses`
- **Summary:** Retrieves all expense records for a specific trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of expenses.
    ```json
    [
      {
        "id": "string",
        "tripId": "string",
        "description": "string",
        "amount": "number",
        "currency": "string",
        "paidBy": "string",
        "date": "string (date)",
        "category": "string"
      }
    ]
    ```

#### Create a new expense record
`POST /trips/{tripId}/expenses`
- **Summary:** Creates a new expense record for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "description": "string",
    "amount": "number",
    "currency": "string",
    "paidBy": "string",
    "date": "string (date)",
    "category": "string"
  }
  ```
- **Responses:**
  - `201 Created`: Expense created successfully.
    ```json
    {
      "id": "string",
      "tripId": "string",
      "description": "string",
      "amount": "number",
      "currency": "string",
      "paidBy": "string",
      "date": "string (date)",
      "category": "string"
    }
    ```

#### Update an expense record
`PUT /expenses/{expenseId}`
- **Summary:** Updates an existing expense record.
- **Security:** `bearerAuth`
- **Parameters:**
  - `expenseId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "description": "string",
    "amount": "number",
    "currency": "string",
    "paidBy": "string",
    "date": "string (date)",
    "category": "string"
  }
  ```
- **Responses:**
  - `200 OK`: Expense updated successfully.
    ```json
    {
      "id": "string",
      "tripId": "string",
      "description": "string",
      "amount": "number",
      "currency": "string",
      "paidBy": "string",
      "date": "string (date)",
      "category": "string"
    }
    ```

#### Delete an expense record
`DELETE /expenses/{expenseId}`
- **Summary:** Deletes an expense record.
- **Security:** `bearerAuth`
- **Parameters:**
  - `expenseId` (path): `string` (uuid) - Required.
- **Responses:**
  - `204 No Content`: Expense deleted successfully.

#### Upload a receipt image for OCR processing
`POST /expenses/{expenseId}/receipt`
- **Summary:** Uploads a receipt image for OCR processing and associates it with an expense.
- **Security:** `bearerAuth`
- **Parameters:**
  - `expenseId` (path): `string` (uuid) - Required.
- **Request Body:**
  - `multipart/form-data` with a `file` (binary)
- **Responses:**
  - `200 OK`: Receipt processed successfully.
    ```json
    {
      "expenseId": "string",
      "extractedData": "object",
      "status": "string"
    }
    ```

#### Get all split expense records for a trip
`GET /trips/{tripId}/splits`
- **Summary:** Retrieves all split expense records for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of split expenses.
    ```json
    [
      {
        "id": "string",
        "expenseId": "string",
        "payerId": "string",
        "payeeId": "string",
        "amount": "number",
        "status": "pending" | "paid" | "cancelled"
      }
    ]
    ```

#### Calculate and create split records for an expense
`POST /expenses/{expenseId}/split`
- **Summary:** Calculates and creates split records for a given expense.
- **Security:** `bearerAuth`
- **Parameters:**
  - `expenseId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "splitMethod": "equal" | "percentage" | "custom",
    "participants": [
      "string"
    ],
    "splitData": "object"
  }
  ```
- **Responses:**
  - `201 Created`: Split records created successfully.
    ```json
    [
      {
        "id": "string",
        "expenseId": "string",
        "payerId": "string",
        "payeeId": "string",
        "amount": "number",
        "status": "pending" | "paid" | "cancelled"
      }
    ]
    ```

#### Update the status of a split record
`PUT /splits/{splitId}/status`
- **Summary:** Updates the status of a specific split record (e.g., from 'pending' to 'paid').
- **Security:** `bearerAuth`
- **Parameters:**
  - `splitId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "status": "pending" | "paid" | "cancelled"
  }
  ```
- **Responses:**
  - `200 OK`: Split status updated successfully.
    ```json
    {
      "id": "string",
      "expenseId": "string",
      "payerId": "string",
      "payeeId": "string",
      "amount": "number",
      "status": "pending" | "paid" | "cancelled"
    }
    ```

#### Get member balances for a trip
`GET /trips/{tripId}/balances`
- **Summary:** Retrieves the current balances (who owes whom) for all members in a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Member balances.
    ```json
    {
      "tripId": "string",
      "balances": [
        {
          "fromUserId": "string",
          "toUserId": "string",
          "amount": "number",
          "currency": "string"
        }
      ],
      "totalSettlementAmount": "number"
    }
    ```

#### Get budget settings for a trip
`GET /trips/{tripId}/budget`
- **Summary:** Retrieves the budget settings and current spending for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Budget details.
    ```json
    {
      "tripId": "string",
      "totalBudget": "number",
      "currency": "string",
      "spentAmount": "number",
      "remainingAmount": "number",
      "alertsEnabled": "boolean"
    }
    ```

#### Update budget settings for a trip
`PUT /trips/{tripId}/budget`
- **Summary:** Updates the budget settings for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "totalBudget": "number",
    "currency": "string",
    "alertsEnabled": "boolean"
  }
  ```
- **Responses:**
  - `200 OK`: Budget updated successfully.
    ```json
    {
      "tripId": "string",
      "totalBudget": "number",
      "currency": "string",
      "spentAmount": "number",
      "remainingAmount": "number",
      "alertsEnabled": "boolean"
    }
    ```

#### Get budget alerts for a trip
`GET /trips/{tripId}/budget/alerts`
- **Summary:** Retrieves any active budget alerts for a trip (e.g., nearing limit).
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: List of budget alerts.
    ```json
    [
      {
        "id": "string",
        "tripId": "string",
        "type": "string",
        "message": "string",
        "timestamp": "string (date-time)"
      }
    ]
    ```

### Multi-Capability Platform (MCP)

#### Get weather data
`GET /mcp/weather`
- **Summary:** Retrieves weather data for a given location.
- **Security:** `bearerAuth`
- **Parameters:**
  - `location` (query): `string` - Required.
- **Responses:**
  - `200 OK`: Weather data.
    ```json
    {
      "location": "string",
      "temperature": "number",
      "unit": "string",
      "condition": "string",
      "humidity": "number",
      "windSpeed": "number"
    }
    ```

#### Get exchange rates
`GET /mcp/exchange-rates`
- **Summary:** Retrieves current exchange rates between two currencies.
- **Security:** `bearerAuth`
- **Parameters:**
  - `from` (query): `string` - Required.
  - `to` (query): `string` - Required.
- **Responses:**
  - `200 OK`: Exchange rate.
    ```json
    {
      "fromCurrency": "string",
      "toCurrency": "string",
      "rate": "number",
      "lastUpdated": "string (date-time)"
    }
    ```

#### Search for places
`GET /mcp/places/search`
- **Summary:** Searches for places (attractions, restaurants, hotels) based on a query.
- **Security:** `bearerAuth`
- **Parameters:**
  - `query` (query): `string` - Required.
  - `location` (query): `string`
- **Responses:**
  - `200 OK`: List of places.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "address": "string",
        "latitude": "number",
        "longitude": "number",
        "type": "string",
        "rating": "number"
      }
    ]
    ```

#### Get place details
`GET /mcp/places/{placeId}/details`
- **Summary:** Retrieves detailed information for a specific place.
- **Security:** `bearerAuth`
- **Parameters:**
  - `placeId` (path): `string` - Required.
- **Responses:**
  - `200 OK`: Place details.
    ```json
    {
      "id": "string",
      "name": "string",
      "address": "string",
      "latitude": "number",
      "longitude": "number",
      "type": "string",
      "rating": "number",
      "phone": "string",
      "website": "string",
      "openingHours": "array"
    }
    ```

#### Plan a route between multiple locations
`POST /mcp/routes/plan`
- **Summary:** Calculates an optimized route based on a list of coordinates.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "coordinates": [
      {
        "latitude": "number",
        "longitude": "number"
      }
    ],
    "optimize": "boolean"
  }
  ```
- **Responses:**
  - `200 OK`: Route plan successfully generated.
    ```json
    {
      "route": [
        {
          "latitude": "number",
          "longitude": "number"
        }
      ],
      "distance": "number",
      "duration": "number"
    }
    ```
  - `400 Bad Request`: Invalid route planning data.

#### Get travel recommendations
`GET /mcp/travel/recommendations`
- **Summary:** Retrieves travel recommendations based on various criteria.
- **Security:** `bearerAuth`
- **Parameters:**
  - `query` (query): `string` - Required.
  - `type` (query): `string` (enum: `attraction`, `restaurant`, `activity`)
- **Responses:**
  - `200 OK`: List of travel recommendations.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "type": "string",
        "description": "string",
        "location": "string",
        "rating": "number"
      }
    ]
    ```

#### Get restaurant recommendations
`GET /mcp/travel/restaurants`
- **Summary:** Retrieves restaurant recommendations for a given location.
- **Security:** `bearerAuth`
- **Parameters:**
  - `location` (query): `string` - Required.
  - `cuisine` (query): `string`
- **Responses:**
  - `200 OK`: List of restaurant recommendations.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "address": "string",
        "cuisine": "string",
        "rating": "number"
      }
    ]
    ```

#### Get activity recommendations
`GET /mcp/travel/activities`
- **Summary:** Retrieves activity recommendations for a given location and date.
- **Security:** `bearerAuth`
- **Parameters:**
  - `location` (query): `string` - Required.
  - `date` (query): `string` (date)
- **Responses:**
  - `200 OK`: List of activity recommendations.
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "location": "string",
        "date": "string (date)",
        "time": "string",
        "description": "string"
      }
    ]
    ```

### Booking

#### Search for flight options
`POST /booking/flights/search`
- **Summary:** Searches for flight options across multiple providers.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "origin": "string",
    "destination": "string",
    "departureDate": "string (date)",
    "returnDate": "string (date)",
    "adults": "integer",
    "children": "integer",
    "infants": "integer",
    "cabinClass": "economy" | "premium_economy" | "business" | "first"
  }
  ```
- **Responses:**
  - `200 OK`: List of flight search results.
    ```json
    [
      {
        "id": "string",
        "provider": "string",
        "price": "number",
        "currency": "string",
        "departureTime": "string (date-time)",
        "arrivalTime": "string (date-time)",
        "duration": "integer",
        "stops": "integer",
        "airline": "string",
        "flightNumber": "string"
      }
    ]
    ```

#### Search for hotel options
`POST /booking/hotels/search`
- **Summary:** Searches for hotel options across multiple providers.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "location": "string",
    "checkInDate": "string (date)",
    "checkOutDate": "string (date)",
    "adults": "integer",
    "children": "integer",
    "rooms": "integer"
  }
  ```
- **Responses:**
  - `200 OK`: List of hotel search results.
    ```json
    [
      {
        "id": "string",
        "provider": "string",
        "name": "string",
        "address": "string",
        "price": "number",
        "currency": "string",
        "rating": "number",
        "amenities": "array"
      }
    ]
    ```

#### Get booking details
`GET /booking/{bookingId}/details`
- **Summary:** Retrieves details of a specific booking (flight or hotel).
- **Security:** `bearerAuth`
- **Parameters:**
  - `bookingId` (path): `string` - Required.
- **Responses:**
  - `200 OK`: Booking details.
    ```json
    {
      "id": "string",
      "type": "flight" | "hotel",
      "provider": "string",
      "status": "string",
      "price": "number",
      "currency": "string",
      "details": "object"
    }
    ```

#### Confirm a booking
`POST /booking/{bookingId}/confirm`
- **Summary:** Confirms a booking. This might trigger a redirect to an external booking provider.
- **Security:** `bearerAuth`
- **Parameters:**
  - `bookingId` (path): `string` - Required.
- **Responses:**
  - `200 OK`: Booking confirmed.
  - `302 Found`: Redirect to external booking provider.

#### Get booking providers status
`GET /booking/providers/status`
- **Summary:** Retrieves the health status and availability of all booking providers.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: Booking providers status information.
    ```json
    {
      "success": "boolean",
      "providers": [
        {
          "name": "string",
          "status": "string",
          "lastCheck": "string (date-time)",
          "message": "string"
        }
      ],
      "summary": {
        "total": "integer",
        "available": "integer",
        "unavailable": "integer"
      }
    }
    ```

#### Trigger health check for all booking providers
`POST /booking/providers/health-check`
- **Summary:** Forces a health check for all booking providers to verify their availability and connectivity.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: Health check completed successfully
    ```json
    {
      "success": "boolean",
      "message": "string",
      "timestamp": "string (date-time)"
    }
    ```
  - `500 Internal Server Error`: Health check failed

#### Reset all circuit breakers
`POST /booking/circuit-breakers/reset`
- **Summary:** Resets all circuit breakers for booking providers, allowing failed providers to be retried.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: Circuit breakers reset successfully
    ```json
    {
      "success": "boolean",
      "message": "string",
      "timestamp": "string (date-time)"
    }
    ```
  - `500 Internal Server Error`: Reset operation failed

#### Update booking service configuration
`PUT /booking/config`
- **Summary:** Updates runtime configuration for the booking service, including failover and retry settings.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "enableFailover": "boolean",
    "maxRetries": "integer" (min: 0, max: 5)
  }
  ```
- **Responses:**
  - `200 OK`: Configuration updated successfully
    ```json
    {
      "success": "boolean",
      "message": "string",
      "timestamp": "string (date-time)"
    }
    ```
  - `400 Bad Request`: Invalid configuration parameters
  - `500 Internal Server Error`: Configuration update failed

### Notifications

#### Get all notifications for the user
`GET /users/me/notifications`
- **Summary:** Retrieves all notifications for the authenticated user.
- **Security:** `bearerAuth`
- **Responses:**
  - `200 OK`: List of notifications.
    ```json
    [
      {
        "id": "string",
        "userId": "string",
        "type": "string",
        "message": "string",
        "read": "boolean",
        "timestamp": "string (date-time)"
      }
    ]
    ```

#### Mark a notification as read
`PUT /notifications/{notificationId}/read`
- **Summary:** Marks a specific notification as read.
- **Security:** `bearerAuth`
- **Parameters:**
  - `notificationId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Notification marked as read.

#### Update user notification settings
`PUT /users/me/notification-settings`
- **Summary:** Updates the notification settings for the authenticated user.
- **Security:** `bearerAuth`
- **Request Body:**
  ```json
  {
    "emailEnabled": "boolean",
    "pushEnabled": "boolean",
    "smsEnabled": "boolean"
  }
  ```
- **Responses:**
  - `200 OK`: Notification settings updated.
    ```json
    {
      "emailEnabled": "boolean",
      "pushEnabled": "boolean",
      "smsEnabled": "boolean"
    }
    ```

### Quick Actions

#### Quickly add a destination to the trip itinerary
`POST /trips/{tripId}/quick-actions/add-destination`
- **Summary:** Quickly adds a destination to the trip itinerary.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "destinationName": "string",
    "date": "string (date)"
  }
  ```
- **Responses:**
  - `200 OK`: Destination added.

#### Initiate an expense split for a trip
`POST /trips/{tripId}/quick-actions/split-expense`
- **Summary:** Initiates an expense split for a trip.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "expenseId": "string",
    "method": "string"
  }
  ```
- **Responses:**
  - `200 OK`: Expense split initiated.

#### Get current weather for the trip's destination
`POST /trips/{tripId}/quick-actions/get-weather`
- **Summary:** Retrieves current weather for the trip's destination.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Responses:**
  - `200 OK`: Weather data.
    ```json
    {
      "location": "string",
      "temperature": "number",
      "unit": "string",
      "condition": "string",
      "humidity": "number",
      "windSpeed": "number"
    }
    ```

#### Quickly create a new vote in the trip's chat
`POST /trips/{tripId}/quick-actions/create-vote`
- **Summary:** Quickly creates a new vote in the trip's chat.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "title": "string",
    "options": [
      {}
    ]
  }
  ```
- **Responses:**
  - `201 Created`: Vote created successfully.
    ```json
    {
      "id": "string",
      "tripId": "string",
      "title": "string",
      "options": [],
      "deadline": "string (date-time)",
      "status": "string"
    }
    ```

### AI Agents

#### Trigger AI agents to optimize trip itinerary
`POST /trips/{tripId}/agents/optimize-itinerary`
- **Summary:** Orchestrates multiple AI agents to analyze requirements and optimize the trip itinerary based on chat messages and preferences.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "messages": [
      {}
    ],
    "options": {
      "prioritizeTime": "boolean",
      "prioritizeCost": "boolean",
      "prioritizeExperience": "boolean",
      "generateAlternatives": "boolean"
    }
  }
  ```
- **Responses:**
  - `200 OK`: Itinerary optimization completed successfully.
    ```json
    {
      "tripId": "string",
      "optimizedItinerary": "object",
      "recommendations": "array",
      "analysisSummary": "string"
    }
    ```
  - `400 Bad Request`: Invalid request data
  - `404 Not Found`: Trip not found
  - `500 Internal Server Error`: Optimization failed

#### Request AI recommendations for a trip
`POST /trips/{tripId}/agents/recommendations`
- **Summary:** Requests AI recommendations (destinations, activities, general) based on trip context and user preferences.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "type": "destination" | "activity" | "general",
    "context": {},
    "preferences": {}
  }
  ```
- **Responses:**
  - `200 OK`: List of AI-generated recommendations.
    ```json
    {
      "success": "boolean",
      "recommendations": [
        {
          "id": "string",
          "name": "string",
          "type": "string",
          "description": "string",
          "score": "number (float)",
          "details": {}
        }
      ]
    }
    ```

#### Analyze travel requirements from chat messages
`POST /trips/{tripId}/agents/analyze-requirements`
- **Summary:** Uses AI agents to extract and analyze travel requirements from conversation messages.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "messages": [
      {}
    ]
  }
  ```
- **Responses:**
  - `200 OK`: Requirements analysis completed successfully.
    ```json
    {
      "tripId": "string",
      "extractedRequirements": "object",
      "summary": "string",
      "actionableItems": "array"
    }
    ```

#### Handle adaptive adjustments for trip disruptions
`POST /trips/{tripId}/agents/adjust-plan`
- **Summary:** Creates adjustment plans when disruptions occur during travel.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
- **Request Body:**
  ```json
  {
    "disruption": {
      "type": "weather" | "transportation" | "accommodation" | "activity_closure" | "emergency",
      "severity": "low" | "medium" | "high" | "critical",
      "affectedDestination": "string",
      "affectedDate": "string (date)",
      "description": "string",
      "suggestedActions": [
        "string"
      ]
    }
  }
  ```
- **Responses:**
  - `200 OK`: Adjustment plan created successfully.
    ```json
    {
      "tripId": "string",
      "disruption": "object",
      "adjustmentPlan": "object",
      "impactAnalysis": "string"
    }
    ```

#### Get agent session status
`GET /trips/{tripId}/agents/status/{sessionId}`
- **Summary:** Retrieves the current status of an AI agent workflow session.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `sessionId` (path): `string` - Required.
- **Responses:**
  - `200 OK`: Session status retrieved successfully.
    ```json
    {
      "sessionId": "string",
      "status": "string",
      "progress": "number",
      "currentStep": "string",
      "output": "object",
      "errors": "array"
    }
    ```
  - `404 Not Found`: Session not found

#### Cancel an active agent session
`DELETE /trips/{tripId}/agents/sessions/{sessionId}`
- **Summary:** Cancels an active AI agent workflow session.
- **Security:** `bearerAuth`
- **Parameters:**
  - `tripId` (path): `string` (uuid) - Required.
  - `sessionId` (path): `string` - Required.
- **Responses:**
  - `204 No Content`: Agent session cancelled successfully.

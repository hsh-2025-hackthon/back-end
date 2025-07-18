# API Design Specification

This document specifies the API contract between the frontend and backend, including RESTful endpoints and WebSocket events for real-time features. It should be implemented using the OpenAPI 3.0 standard.

## 1. Authentication

All API requests must include a `Authorization` header with a Bearer token (JWT) obtained from Azure AD B2C.

```
Authorization: Bearer <your_jwt_token>
```

The backend will validate the token against the Azure AD B2C tenant.

## 2. REST API Endpoints

Base URL: `/api/v1`

### Trips

-   **`POST /trips`**: Create a new trip.
    -   **Body:** `{ "title": "string", "description": "string", "startDate": "date", "endDate": "date" }`
    -   **Response:** `201 Created` with the new trip object.
-   **`GET /trips`**: Get all trips for the authenticated user.
    -   **Response:** `200 OK` with an array of trip objects.
-   **`GET /trips/{tripId}`**: Get details of a specific trip.
    -   **Response:** `200 OK` with the trip object.
-   **`PUT /trips/{tripId}`**: Update a trip's details.
    -   **Body:** `{ "title": "string", "description": "string", ... }`
    -   **Response:** `200 OK` with the updated trip object.
-   **`DELETE /trips/{tripId}`**: Delete a trip.
    -   **Response:** `204 No Content`.

### Itinerary

-   **`POST /trips/{tripId}/destinations`**: Add a destination to a trip.
    -   **Body:** `{ "name": "string", "location": { ... }, ... }`
    -   **Response:** `201 Created` with the updated trip object.
-   **`PUT /trips/{tripId}/destinations/{destinationId}`**: Update a destination.
    -   **Response:** `200 OK`.
-   **`DELETE /trips/{tripId}/destinations/{destinationId}`**: Remove a destination.
    -   **Response:** `204 No Content`.

### Collaborators

-   **`POST /trips/{tripId}/collaborators`**: Add a collaborator to a trip.
    -   **Body:** `{ "email": "string", "role": "editor" | "viewer" }`
    -   **Response:** `200 OK`.
-   **`DELETE /trips/{tripId}/collaborators/{userId}`**: Remove a collaborator.
    -   **Response:** `204 No Content`.

### AI Suggestions

-   **`POST /ai/generate-itinerary`**: Generate a full itinerary based on user preferences.
    -   **Body:** `{ "destination": "string", "duration": "number", "budget": "number", "interests": ["string"] }`
    -   **Response:** `200 OK` with a structured itinerary object.

## 3. WebSocket Events (for Real-time Collaboration)

These events are sent over the Azure Web PubSub connection and are used to sync the Y.js document.

-   **Hub Name:** `collaborationHub`
-   **Group:** Each trip has its own group, identified by `tripId`.

### Client-to-Server Events

-   **`updateItinerary`**: Sent when a user makes a change to the itinerary.
    -   **Payload:** The payload is a Y.js update message (a binary blob). The backend service managing the Web PubSub connection will receive this and broadcast it to all other members of the group.

### Server-to-Client Events

-   **`itineraryUpdated`**: Broadcast to all clients in a trip's group when a change has been made.
    -   **Payload:** The Y.js update message from the originating client.
-   **`presenceUpdate`**: Sent when a user joins or leaves a trip's collaboration session.
    -   **Payload:** `{ "userId": "string", "status": "joined" | "left" }`

## 4. OpenAPI Specification (Example Snippet)

An `openapi.yaml` file should be created to formally define the API.

```yaml
openapi: 3.0.0
info:
  title: Collaborative Travel Planner API
  version: 1.0.0
paths:
  /trips:
    get:
      summary: Get user's trips
      security:
        - bearerAuth: []
      responses:
        '200':
          description: A list of trips.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Trip'
components:
  schemas:
    Trip:
      type: object
      properties:
        id: 
          type: string
          format: uuid
        title:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

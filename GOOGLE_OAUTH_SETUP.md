# Google OAuth Setup Guide

This project has been migrated from Azure AD B2C to Google OAuth for authentication.

## Environment Variables

Add the following environment variable to your `.env` file:

```bash
GOOGLE_CLIENT_ID=your_google_client_id_here
```

## Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API and Google Identity API
4. Go to "Credentials" in the sidebar
5. Click "Create Credentials" > "OAuth client ID"
6. Choose "Web application" as the application type
7. Add your domain to "Authorized JavaScript origins" (e.g., `http://localhost:3000` for development)
8. Add your redirect URIs to "Authorized redirect URIs"
9. Copy the Client ID and add it to your environment variables

## Frontend Integration

Your frontend application should:

1. Use Google Sign-In library to authenticate users
2. Obtain an ID token from Google
3. Send the ID token in the Authorization header as `Bearer <token>`
4. The backend will validate the token and create/find the user automatically

### Example Frontend Code (React with Google Identity Library)

```html
<!-- Add to your HTML head -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```javascript
// Initialize Google Sign-In
window.onload = function() {
  google.accounts.id.initialize({
    client_id: 'YOUR_GOOGLE_CLIENT_ID',
    callback: handleCredentialResponse
  });
  
  google.accounts.id.renderButton(
    document.getElementById('google-signin-button'),
    { theme: 'outline', size: 'large' }
  );
};

function handleCredentialResponse(response) {
  // response.credential contains the ID token
  const idToken = response.credential;
  
  // Send the token to your backend
  fetch('/api/users/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    console.log('User authenticated:', data);
    // Handle successful authentication
  })
  .catch(error => {
    console.error('Authentication failed:', error);
  });
}
```

### Example API Request

```bash
curl -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/users/me
```

## Database Migration

To apply the database changes, run:

```bash
npm run migrate
```

This will add the `google_id` column to the users table and create the necessary indexes.

## API Changes

- Users are now identified by their Google ID instead of Azure AD ID
- The `/users/me` endpoint returns `googleId` instead of `azureAdId`
- Email verification is enforced (users must have verified emails in Google)

## Migration from Azure AD B2C

If you have existing users with Azure AD IDs:

1. The migration preserves the `azure_ad_id` column during transition
2. New users will be created with `google_id`
3. You may need to handle user account linking manually if users switch from Azure AD to Google
4. After confirming all users have migrated, you can remove the `azure_ad_id` column

## Security Notes

- ID tokens are validated against Google's public keys
- Email verification is required
- Tokens are checked for proper audience (your client ID)
- Token expiration is enforced

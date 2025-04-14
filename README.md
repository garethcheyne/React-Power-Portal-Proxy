# React Power Portal Proxy

A lightweight proxy service for Microsoft Power Portal development that handles authentication using Playwright, with an integrated dashboard for monitoring and managing requests.

## Project Structure

This project consists of two main components:

1. **Proxy Service** - A Node.js proxy server that handles authentication and forwards requests
2. **Dashboard** - A Next.js web interface for monitoring and inspecting API requests

## Features

- Automatically handles authentication using Playwright
- Acts as a proxy for API requests
- Maintains session cookies and forwards them to the target application
- Interactive dashboard for monitoring API traffic
- Request inspector to analyze request/response details

## Setup

1. Make sure you have Node.js installed (v14 or newer recommended)
2. Install dependencies for both components:
   ```
   # Install root dependencies (including concurrently)
   npm install
   
   # Install proxy server dependencies
   cd proxy && npm install
   
   # Install dashboard dependencies
   cd dashboard && npm install
   ```
3. Configure your `.env` file in the proxy directory with your credentials and settings (a template is provided)

## Environment Variables

The following environment variables need to be set in your `proxy/.env` file:

- `POWERPORTAL_BASEURL`: Base URL of the Power Portal
- `AUTH_PROVIDER`: Authentication provider URL
- `LOGIN_URL`: Login endpoint URL
- `RETURN_URL`: URL to return to after authentication
- `AUTH_USERNAME`: Your username/email
- `AUTH_PASSWORD`: Your password
- `PORT`: Port for the proxy server (default: 3000)

## Usage

Start both the proxy service and dashboard in development mode:

```
npm run dev
```

For production:

```
npm start
```

This will start:
- The proxy server on http://localhost:5000 (or the port specified in your .env file)
- The dashboard on http://localhost:5001

You can also run each component separately:

```
# Run only the proxy server in dev mode
npm run dev-proxy

# Run only the dashboard in dev mode
npm run dev-dashboard

# Run only the proxy server in production mode
npm run start-proxy

# Run only the dashboard in production mode
npm run start-dashboard
```

## How it Works

1. When you start the server, it will use Playwright to open Microsoft Edge
2. It will navigate to the login page and authenticate with your credentials
3. After successful authentication, it captures the cookies and headers
4. Subsequent requests are proxied to the target application with the authenticated session
5. The dashboard displays real-time information about API requests and responses

## Screenshots

![Dashboard Preview](./screenshots/image.png)

The screenshot above shows the application's dashboard interface, which displays API request monitoring and provides tools for inspecting the requests and responses.

## Security Note

Your credentials are stored in the `.env` file. Make sure to:
- Never commit the `.env` file to source control
- Keep your credentials secure
- Consider using environment variables in production environments instead of a .env file
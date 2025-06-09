const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        // Get the current auth data from the session
        const authData = req.app.get('persistentAuthData');
        if (!authData || !authData.cookies) {
            return res.status(401).json({ error: 'No active session found' });
        }

        // Find the ASP.NET auth cookie
        const aspNetCookie = authData.cookies.find(cookie => cookie.name === '.AspNet.ApplicationCookie');
        if (!aspNetCookie) {
            return res.status(401).json({ error: 'Auth token not found' });
        }

        // Return token info and example curl command
        const baseUrl = process.env.POWERPORTAL_BASEURL;
        const curlCommand = `curl -X GET "${baseUrl}/api/v1/auth/whoami" \\
  -H "Cookie: .AspNet.ApplicationCookie=${aspNetCookie.value}" \\
  -H "Accept: application/json" \\
  --insecure`;

        res.json({
            cookie: {
                name: aspNetCookie.name,
                value: aspNetCookie.value,
                domain: aspNetCookie.domain,
                path: aspNetCookie.path,
                expires: aspNetCookie.expires,
                httpOnly: aspNetCookie.httpOnly,
                secure: aspNetCookie.secure
            },
            curlCommand
        });
    } catch (error) {
        console.error('Error getting auth token:', error);
        res.status(500).json({ error: 'Failed to get auth token' });
    }
});

module.exports = router;

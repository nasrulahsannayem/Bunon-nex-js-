import express from 'express';
const router = express.Router();

// Required: VITE_META_PIXEL_ID and META_CAPI_TOKEN in .env
const PIXEL_ID = process.env.VITE_META_PIXEL_ID || '887459306920960'; // centralized with frontend
const CAPI_TOKEN = process.env.META_CAPI_TOKEN || 'EACLzchGo0UQBRZCWYy8gECqLqFsHgvlK1TAoY1ZA9tvX495Nt77KNU3NQZAU9OGuZB5rZCQvBZAGjENZBikZAZBZCiseyGQnG062gIbgKH4SlIzsrb9uol5yr3jH5jwRICN3hzGpZC5VfHU4yOZBpoNeau4EQCj6hZBjYFDMEaMPbjao4G8cZBwstii7OC9P8d0ImY8wZDZD';

router.post('/', async (req, res) => {
  try {
    const { event_name, event_time, user_data, custom_data, event_id, event_source_url, action_source } = req.body;

    if (!event_name || !event_id) {
      return res.status(400).json({ error: 'event_name and event_id are required' });
    }

    // Capture standard IP and User-Agent for better Event Match Quality
    const clientIpAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const clientUserAgent = req.headers['user-agent'] || '';

    // Helper to normalize and hash in SHA256
    const hashData = (val: string) => {
      if (!val) return undefined;
      const normalized = val.toString().trim().toLowerCase();
      if (!normalized) return undefined;
      return require('crypto').createHash('sha256').update(normalized).digest('hex');
    };

    const userDataHash = user_data || {};
    const hashedUserData: any = {};
    
    // Hash specific fields if they exist
    ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'].forEach(key => {
      if (userDataHash[key]) {
        // external_id does not strictly require hashing but it's often recommended, however Bunon sends plain external_id, we will hash it just in case or leave it plain if we don't want to break it. 
        // FB accepts plain external_id, but email, phone, name, etc MUST be hashed.
        if (key === 'external_id') {
          hashedUserData[key] = userDataHash[key];
        } else {
          hashedUserData[key] = hashData(userDataHash[key]);
        }
      }
    });

    const enrichedUserData = {
      ...userDataHash,
      ...hashedUserData,
      client_ip_address: typeof clientIpAddress === 'string' ? clientIpAddress.split(',')[0].trim() : clientIpAddress,
      client_user_agent: clientUserAgent,
    };

    const payload: any = {
      data: [
        {
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          action_source: action_source || 'website',
          event_id: event_id,
          event_source_url: event_source_url || (process.env.DOMAIN_URL || 'https://bunon.shop'),
          user_data: enrichedUserData,
          custom_data: custom_data || {}
        }
      ]
    };

    // Add Test Event Code if provided in environment variables for debugging
    const testCode = process.env.META_TEST_EVENT_CODE || 'TEST6008';
    if (testCode) {
      payload.test_event_code = testCode;
    }

    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (result.error) {
      console.error('[CAPI ERROR]', result.error);
      return res.status(400).json({ success: false, error: result.error });
    }

    console.log(`[CAPI SUCCESS] ${event_name} - ID: ${event_id}`);
    res.json({ success: true, result });

  } catch (err) {
    console.error('[CAPI EXCEPTION]', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;

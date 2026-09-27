const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// Initialize Razorpay SDK
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper: Coordinate Jitter (Fuzzy Geolocation Offset)
function applyFuzzyLocation(lat, lng, radiusKm = 1.0) {
    const earthRadius = 6371;
    const radius = radiusKm * Math.sqrt(Math.random());
    const angle = Math.random() * 2 * Math.PI;

    const deltaLat = (radius / earthRadius) * (180 / Math.PI);
    const deltaLng = (radius / (earthRadius * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);

    return {
        fuzzyLat: lat + deltaLat * Math.sin(angle),
        fuzzyLng: lng + deltaLng * Math.cos(angle)
    };
}

// 1. Initiate Razorpay Order (INR 10 for Single Call or INR 100 for Annual Pass)
app.post('/api/payments/create-order', async (req, res) => {
    const { userId, planType } = req.body; // planType: 'SINGLE_VIDEO' or 'ANNUAL_PASS'
    
    let amount = 0;
    if (planType === 'SINGLE_VIDEO') amount = 10 * 100; // 10 INR in paise
    else if (planType === 'ANNUAL_PASS') amount = 100 * 100; // 100 INR in paise
    else return res.status(400).json({ error: 'Invalid Plan' });

    try {
        const order = await razorpay.orders.create({
            amount,
            currency: 'INR',
            receipt: `rcpt_${userId}_${Date.now()}`,
            notes: { userId, planType }
        });

        // Save order to DB as 'CREATED'
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Razorpay Webhook/Verification Handler
app.post('/api/payments/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planType } = req.body;

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature === razorpay_signature) {
        // Payment Authentic - Update User Credits in DB
        if (planType === 'SINGLE_VIDEO') {
            // DB Query: UPDATE profiles SET video_credits = video_credits + 1 WHERE user_id = userId
        } else if (planType === 'ANNUAL_PASS') {
            // DB Query: UPDATE profiles SET annual_sub_active = true, annual_sub_expires_at = NOW() + INTERVAL '1 YEAR' WHERE user_id = userId
        }
        res.json({ status: 'SUCCESS' });
    } else {
        res.status(400).json({ status: 'INVALID_SIGNATURE' });
    }
});

app.listen(3000, () => console.log('ChatGupt Server running on port 3000'));const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Store active socket rooms
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a private match room
    socket.on('join-room', ({ roomId, userId }) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', { userId, socketId: socket.id });
    });

    // Relay WebRTC Offer
    socket.on('offer', ({ roomId, offer }) => {
        socket.to(roomId).emit('offer', { offer, senderSocketId: socket.id });
    });

    // Relay WebRTC Answer
    socket.on('answer', ({ roomId, answer }) => {
        socket.to(roomId).emit('answer', { answer });
    });

    // Relay ICE Candidates
    socket.on('ice-candidate', ({ roomId, candidate }) => {
        socket.to(roomId).emit('ice-candidate', { candidate });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});
app.post('/api/meetups/reserve', async (req, res) => {
    const { userId, meetupId } = req.body;

    try {
        const query = 'SELECT reserve_meetup_seat($1, $2, 100) AS result;';
        const { rows } = await db.query(query, [userId, meetupId]);
        const response = rows[0].result;

        if (response.success) {
            return res.status(200).json(response);
        } else {
            return res.status(400).json(response);
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});
server.listen(4000, () => console.log('Signaling server running on port 4000'));const CACHE_NAME = 'chatgupt-v1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 1. Service Worker Installation & Pre-caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Service Worker Activation & Cache Cleanup
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event Interceptor (Cache First with Network Fallback)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude real-time API endpoints, WebSocket connections, and Razorpay calls from caching
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.hostname.includes('razorpay.com')
  ) {
    return; // Pass through directly to network
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly fetched static assets on the fly
        if (event.request.method === 'GET' && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    }).catch(() => {
      // Offline Fallback Page if network fails
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

// 4. Web Push Notification Event Handler (Match & Merchant Alerts)
self.addEventListener('push', (event) => {
  let data = { title: 'Code ChatGupt', body: 'New secret match nearby!' };
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data.url;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'public/icons');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function createPwaIcon(size, isMaskable = false) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 1. Draw Background
    if (isMaskable) {
        ctx.fillStyle = '#121212'; // Solid app background for maskable
        ctx.fillRect(0, 0, size, size);
    } else {
        // Transparent or slightly rounded for standard icons
        ctx.clearRect(0, 0, size, size);
    }

    // 2. Calculate Safe Area Padding
    // Maskable icons restrict graphic to inner 80% circle (40% radius)
    const scale = isMaskable ? 0.6 : 0.8;
    const center = size / 2;
    const graphicSize = size * scale;

    // 3. Draw Icon Logo (Code ChatGupt - Masked Spy / Speech Bubble Motif)
    ctx.save();
    ctx.translate(center, center);

    // Chat Bubble Base
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(0, -graphicSize * 0.05, graphicSize * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Inner Stealth/Secret Eye Element
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.ellipse(0, -graphicSize * 0.05, graphicSize * 0.22, graphicSize * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(0, -graphicSize * 0.05, graphicSize * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // "CG" Brand Monogram Text at Bottom
    ctx.fillStyle = isMaskable ? '#00ffcc' : '#ffffff';
    ctx.font = `bold ${Math.round(graphicSize * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHATGUPT', 0, graphicSize * 0.28);

    ctx.restore();

    // 4. Export PNG Stream
    const filename = isMaskable ? `icon-${size}-maskable.png` : `icon-${size}.png`;
    const out = fs.createWriteStream(path.join(outputDir, filename));
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => console.log(`[Generated] ${filename}`));
}

// Generate Standard & Maskable Icon Assets
[192, 512].forEach(size => {
    createPwaIcon(size, false); // Standard (transparent/any)
    createPwaIcon(size, true);  // Maskable (solid background + safe padding)
});

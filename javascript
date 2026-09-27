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

server.listen(4000, () => console.log('Signaling server running on port 4000'));

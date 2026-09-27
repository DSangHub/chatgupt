-- Enums
CREATE TYPE user_gender AS ENUM ('Male', 'Female', 'Non-Binary', 'Other');
CREATE TYPE intent_type AS ENUM ('Casual Chat', 'Mate', 'Life Partner', 'Business Lunch/Tea');

-- Users & Profiles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL, -- Mandatory for Indian compliance
    is_18_plus BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    gender user_gender NOT NULL,
    city VARCHAR(50) NOT NULL,
    primary_intent intent_type NOT NULL,
    min_age_pref INT DEFAULT 18,
    max_age_pref INT DEFAULT 99,
    interests TEXT[], -- Array of general interests
    
    -- Optional Fields
    hobbies TEXT[],
    fav_actor VARCHAR(50),
    fav_cricket_team VARCHAR(50),
    fav_cricket_player VARCHAR(50),
    
    -- Fuzzy Geolocation (Geohash / Coarse Coordinates)
    fuzzy_lat DOUBLE PRECISION,
    fuzzy_lng DOUBLE PRECISION,
    geohash VARCHAR(12),
    
    -- Verification & Entitlements
    is_video_verified BOOLEAN DEFAULT FALSE,
    annual_sub_active BOOLEAN DEFAULT FALSE,
    annual_sub_expires_at TIMESTAMP,
    video_credits INT DEFAULT 0
);

-- Business Profiles (Sponsors / Meetup Venues)
CREATE TABLE business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    business_name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- e.g., 'Cafe', 'Restaurant', 'Lounge'
    city VARCHAR(50) NOT NULL,
    address TEXT,
    offer_details TEXT -- e.g., '15% off for ChatGupt Meetup Pairs'
);

-- Razorpay Payment Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
    razorpay_payment_id VARCHAR(100),
    amount_inr INT NOT NULL, -- 10 or 100
    plan_type VARCHAR(20) NOT NULL, -- 'SINGLE_VIDEO' or 'ANNUAL_PASS'
    status VARCHAR(20) DEFAULT 'CREATED' -- CREATED, SUCCESS, FAILED
);

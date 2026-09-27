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
);CREATE OR REPLACE FUNCTION reserve_meetup_seat(
    p_user_id UUID,
    p_meetup_id UUID,
    p_max_capacity INT DEFAULT 100
) 
RETURNS JSONB 
LANGUAGE plpgsql 
AS $$
DECLARE
    v_is_verified BOOLEAN;
    v_current_count INT;
    v_existing_reservation UUID;
    v_lock_key BIGINT;
BEGIN
    -- 1. Check if the user is video-verified
    SELECT is_video_verified INTO v_is_verified
    FROM profiles
    WHERE user_id = p_user_id;

    IF v_is_verified IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'VIDEO_VERIFICATION_REQUIRED',
            'message', 'You must complete a video verification call before reserving a seat.'
        );
    END IF;

    -- 2. Prevent duplicate reservations by the same user
    SELECT id INTO v_existing_reservation
    FROM meetup_reservations
    WHERE meetup_id = p_meetup_id AND user_id = p_user_id;

    IF v_existing_reservation IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'ALREADY_RESERVED',
            'message', 'You already have a reserved seat for this meetup.'
        );
    END IF;

    -- 3. Acquire a Transaction-Scoped Advisory Lock for this specific meetup ID
    -- This serializes the FCFS check-and-insert step per meetup to avoid race conditions.
    -- The lock is automatically released upon COMMIT or ROLLBACK.
    v_lock_key := hashtext(p_meetup_id::text);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 4. Count existing confirmed reservations inside the locked critical section
    SELECT COUNT(*) INTO v_current_count
    FROM meetup_reservations
    WHERE meetup_id = p_meetup_id;

    -- 5. Enforce FCFS Capacity
    IF v_current_count >= p_max_capacity THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'CAPACITY_REACHED',
            'message', 'Sorry, all 100 reserved seats have been claimed.'
        );
    END IF;

    -- 6. Insert Reservation & Return Success Payload
    INSERT INTO meetup_reservations (meetup_id, user_id, reserved_at)
    VALUES (p_meetup_id, p_user_id, NOW());

    RETURN jsonb_build_object(
        'success', true,
        'seat_number', v_current_count + 1,
        'message', 'Seat successfully reserved!'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'SERVER_ERROR',
            'message', SQLERRM
        );
END;
$$;
